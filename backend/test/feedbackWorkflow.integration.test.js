const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const net = require('node:net');
const mongoose = require('mongoose');
const express = require('express');
require('express-async-errors');
const jwt = require('jsonwebtoken');
const Feedback = require('../src/models/Feedback');
const Admin = require('../src/models/Admin');
const User = require('../src/models/User');
const Tenant = require('../src/models/Tenant');
const workflow = require('../src/utils/feedbackWorkflow');
const { visibleTodo } = require('../src/utils/humanWorkbench');
const oid = () => new mongoose.Types.ObjectId();

test('feedback assignment HTTP workflow on an isolated MongoDB', { skip: !process.env.TEST_MONGOD, timeout: 90000 }, async t => {
  process.env.JWT_SECRET = randomBytes(32).toString('hex');
  const dbName = 'feedback_test_' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(path.join(tmpdir(), 'feedback-test-'));
  const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
  const mongo = spawn(process.env.TEST_MONGOD, ['--dbpath', directory, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => { await mongoose.disconnect(); mongo.kill(); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Isolated Mongo startup timeout')), 30000);
    mongo.once('error', err => { clearTimeout(timer); reject(err); });
    mongo.once('exit', code => { clearTimeout(timer); reject(new Error('Mongo exited ' + code)); });
    mongo.stdout.on('data', value => { if (String(value).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
    mongo.stderr.resume();
  });
  await mongoose.connect(`mongodb://127.0.0.1:${port}/${dbName}`, { autoIndex: false });
  const tenant = oid(), foreign = oid(), customer = oid();
  await Tenant.collection.insertMany([tenant, foreign].map((_id, index) => ({ _id, name: 'Synthetic tenant ' + index, code: 'feedback-test-' + index, status: 'active', serviceScope: ['admin', 'staff'] })));
  const actor = (name, role, tenantId = tenant, staffStatus = 'active') => ({ _id: oid(), name, username: name, role, tenantId, staffStatus, mustChangePassword: false, password: 'unused-in-isolated-test' });
  const manager = actor('Synthetic manager', 'superadmin'), first = actor('Synthetic first', 'healthManager'), second = actor('Synthetic second', 'nutritionist'), outsider = actor('Synthetic outsider', 'superadmin', foreign), inactive = actor('Synthetic inactive', 'healthManager', tenant, 'inactive'), hr = actor('Synthetic HR', 'enterprise_hr');
  await Admin.collection.insertMany([manager, first, second, outsider, inactive, hr]);
  await User.collection.insertOne({ _id: customer, name: 'Synthetic user', phone: 'synthetic-feedback-user', tenantId: tenant });
  const app = express(); app.use(express.json()); app.use('/api/feedback', require('../src/routes/feedback'));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/feedback`;
  const request = async (person, suffix = '', method = 'GET', body) => {
    const token = jwt.sign({ id: String(person?._id || customer), ...(person ? { type: 'admin' } : {}) }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const result = await fetch(url + suffix, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, body: await result.json() };
  };
  let id;
  await t.test('new feedback starts unassigned; employee cannot dispatch', async () => {
    assert.equal((await request(null, '', 'POST', { content: 'Synthetic feedback for assignment', type: '功能异常' })).status, 200);
    const list = await request(manager, '?stage=unassigned');
    assert.equal(list.body.total, 1); id = list.body.data[0]._id;
    assert.equal((await request(first)).status, 403);
    assert.equal((await request(first, `/${id}/assign`, 'POST', { assignedTo: String(first._id), version: 0 })).status, 403);
  });
  await t.test('eligible assignees exclude foreign, inactive and HR accounts', async () => {
    const list = (await request(manager, '/assignees')).body.data;
    assert.deepEqual(new Set(list.map(p => p._id)), new Set([manager, first, second].map(p => String(p._id))));
    for (const person of [outsider, inactive, hr]) assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(person._id), version: 0 })).status, 400);
  });
  await t.test('cross-tenant read and assignment denied', async () => {
    assert.equal((await request(outsider)).body.total, 0);
    assert.equal((await request(outsider, `/${id}/assign`, 'POST', { assignedTo: String(outsider._id), version: 0 })).status, 409);
  });
  await t.test('assignment creates only the assignee workbench item and hides internal fields from customer', async () => {
    assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(first._id), note: 'Private handling instruction', version: 0 })).status, 200);
    assert.equal((await workflow.loadTodos(first)).length, 1); assert.equal((await workflow.loadTodos(second)).length, 0);
    const todo = (await workflow.loadTodos(first))[0];
    assert.equal(visibleTodo(todo, first, () => false), true); assert.equal(visibleTodo(todo, second, () => true), false);
    assert.equal(visibleTodo(todo, manager, () => true), false);
    assert.equal((await request(second, '/assigned')).body.data.length, 0);
    const own = (await request(first, '/assigned')).body.data[0];
    assert.equal(own.assignmentNote, 'Private handling instruction'); assert.equal(own.user, undefined);
    const publicRow = (await request(null, '/mine')).body.data[0];
    for (const key of ['workflowHistory', 'handlingResult', 'assignmentNote', 'assignedTo', 'assignedName']) assert.equal(publicRow[key], undefined);
  });
  await t.test('no premature closure, blind writes, empty result or unrelated actor submission', async () => {
    assert.equal((await request(manager, `/${id}`, 'PATCH', { reply: 'premature', version: 1 })).status, 409);
    assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(first._id) })).status, 400);
    assert.equal((await request(first, `/${id}/result`, 'POST', { result: ' ', version: 1 })).status, 400);
    assert.equal((await request(second, `/${id}/result`, 'POST', { result: 'not mine', version: 1 })).status, 409);
  });
  await t.test('reassignment revokes old assignee access and stale result cannot land', async () => {
    assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(second._id), version: 1 })).status, 200);
    assert.equal((await request(first, '/assigned')).body.data.length, 0);
    assert.equal((await workflow.loadTodos(first)).length, 0);
    assert.equal((await request(first, `/${id}/result`, 'POST', { result: 'old worker', version: 1 })).status, 409);
  });
  await t.test('concurrent submissions commit once, remain pending for manager', async () => {
    const responses = await Promise.all(['Result A', 'Result B'].map(result => request(second, `/${id}/result`, 'POST', { result, version: 2 })));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
    const row = await Feedback.findById(id).lean(); assert.equal(row.status, 'pending'); assert.equal(row.workflowState, 'submitted');
    assert.equal(row.workflowHistory.filter(e => e.action === 'submit').length, 1);
    assert.equal((await workflow.loadTodos(second)).length, 0);
    assert.equal((await request(manager, '?stage=submitted')).body.total, 1);
  });
  await t.test('manager may return for supplementation without destroying prior audit', async () => {
    assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(second._id), note: 'Please supplement', version: 3 })).status, 200);
    const row = await Feedback.findById(id).lean(); assert.equal(row.handlingResult, ''); assert.equal(row.workflowHistory.filter(e => e.action === 'submit').length, 1);
    assert.equal((await request(second, `/${id}/result`, 'POST', { result: 'Supplemented private result', version: 4 })).status, 200);
  });
  await t.test('only manager final reply closes; public record contains no private result', async () => {
    assert.equal((await request(second, `/${id}`, 'PATCH', { reply: 'unauthorized', version: 5 })).status, 403);
    assert.equal((await request(manager, `/${id}`, 'PATCH', { reply: 'Public final reply', version: 5 })).status, 200);
    const row = (await request(null, '/mine')).body.data[0]; assert.equal(row.reply, 'Public final reply'); assert.equal(row.status, 'resolved'); assert.equal(row.handlingResult, undefined);
    assert.equal((await request(manager, `/${id}`, 'PATCH', { reply: 'duplicate', version: 5 })).status, 409);
    assert.equal((await request(manager, `/${id}/assign`, 'POST', { assignedTo: String(first._id), version: 6 })).status, 409);
  });
  await t.test('legacy pending records need no migration; legacy resolved stays closed', async () => {
    const legacy = oid(); await Feedback.collection.insertOne({ _id: legacy, tenantId: tenant, user: customer, type: '其他', content: 'Legacy synthetic', status: 'pending' });
    assert.equal((await request(manager, '?stage=unassigned')).body.total, 1);
    assert.equal((await request(manager, `/${legacy}/assign`, 'POST', { assignedTo: String(first._id), version: 0 })).status, 200);
    assert.equal(workflow.state({ status: 'resolved' }), 'closed');
    assert.equal((await request(manager, '/bad-id/assign', 'POST', { assignedTo: String(first._id), version: 0 })).status, 400);
  });
  await t.test('staff paging and direct todo links retain scope; closed history cannot hide pending work', async () => {
    const pendingId = oid();
    await Feedback.collection.insertMany([
      ...Array.from({ length: 55 }, (_, index) => ({ _id: oid(), tenantId: tenant, user: customer, type: '其他', content: 'Synthetic closed history', status: 'resolved', workflowState: 'closed', assignedTo: first._id, assignedAt: new Date(Date.now() + index * 1000) })),
      { _id: pendingId, tenantId: tenant, user: customer, type: '其他', content: 'Older synthetic pending task', status: 'pending', workflowState: 'assigned', assignedTo: first._id, assignedAt: new Date(0) },
    ]);
    const active = (await request(first, '/assigned')).body;
    assert.equal(active.total, 2); assert.ok(active.data.some(row => row._id === String(pendingId)));
    assert.equal((await request(first, '/assigned?history=1&page=2')).body.data.length, 7);
    assert.equal((await request(first, '/assigned?item=' + pendingId)).body.data.length, 1);
    assert.equal((await request(second, '/assigned?item=' + pendingId)).body.data.length, 0);
    assert.equal((await request(first, '/assigned?item=invalid')).status, 400);
  });
});
