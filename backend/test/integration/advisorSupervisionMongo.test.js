// Explicit localhost-only synthetic test. No .env, production data or AI calls.
const test = require('node:test'), assert = require('node:assert/strict');
const mongoose = require('mongoose'), jwt = require('jsonwebtoken'), express = require('express');
const { randomUUID } = require('crypto');
test('advisor supervision: scoped projections and internal correspondence', { skip: process.env.RUN_ADVISOR_SUPERVISION_TEST !== 'true', timeout: 60000 }, async t => {
  await mongoose.connect(`mongodb://127.0.0.1:27965/jiayicare_supervision_test_${randomUUID().replaceAll('-', '')}`, { autoIndex: false });
  const names = ['User', 'Admin', 'FollowUp', 'Order', 'HealthPlan', 'CareFlow', 'InsuranceServiceCase', 'FollowUpServiceLink', 'ServiceSupervisionRequest'];
  const [User, Admin, Task, Order, Plan, Flow, Insurance, Link, Request] = names.map(n => require(`../../src/models/${n}`));
  const { loadServices } = require('../../src/utils/advisorSupervision');
  const oid = () => new mongoose.Types.ObjectId(), tenant = oid(), otherTenant = oid();
  const advisor = { _id: oid(), role: 'familyDoctor', tenantId: tenant, name: '合成顾问', staffStatus: 'active' };
  const manager = { ...advisor, _id: oid(), role: 'healthManager', name: '合成健管' };
  const planner = { ...advisor, _id: oid(), role: 'healthPlanner', name: '合成规划师' };
  const stranger = { ...advisor, _id: oid(), name: '其他顾问' };
  await Admin.collection.insertMany([advisor, manager, planner, stranger]);
  const p = oid();
  await User.collection.insertOne({ _id: p, tenantId: tenant, name: '合成客户', assignedFamilyDoctor: advisor._id, assignedHealthPlanner: planner._id, assignedHealthManager: manager._id });
  process.env.JWT_SECRET = 'isolated-supervision-test-only';
  const app = express(); app.use(express.json()); app.use('/s', require('../../src/routes/advisorSupervision'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });
  const call = async (who, path = '', body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/s${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${jwt.sign({ id: String(who._id), type: 'admin' }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  };
  const task = async (extra = {}) => { const row = { _id: oid(), patientId: p, assignedTo: manager._id, staffId: planner._id, theme: '合成服务', status: 'planned', date: new Date('2000-01-01'), updatedAt: new Date('2026-01-01'), ...extra }; await Task.collection.insertOne(row); return row; };
  const reset = async () => { for (const M of [Task,Order,Plan,Flow,Insurance,Link,Request]) await M.collection.deleteMany({}); };
  const snapshot = async () => JSON.stringify(await Promise.all([Task,Order,Plan,Flow,Insurance,Link].map(M => M.collection.find({}).sort({ _id: 1 }).toArray())));
  await t.test('only assigned live same-tenant customers; pure reads and own tasks excluded', async () => {
    await reset(); await task(); await task({ assignedTo: advisor._id });
    for (const extra of [{ tenantId: otherTenant }, { isDeleted: true }, { assignedFamilyDoctor: stranger._id }]) {
      const patientId = oid(); await User.collection.insertOne({ _id: patientId, tenantId: tenant, assignedFamilyDoctor: advisor._id, ...extra }); await task({ patientId });
    }
    const before = await snapshot(), rows = await loadServices(advisor);
    assert.equal(rows.length, 1); assert.ok(rows[0].reasons.includes('已逾期')); assert.equal(await snapshot(), before);
    assert.equal((await call(advisor, `/tasks/${rows[0].taskId}`)).status, 200);
    assert.equal((await call(stranger, `/tasks/${rows[0].taskId}`)).status, 403);
    assert.equal((await call(manager, `/tasks/${rows[0].taskId}`)).status, 403);
    assert.equal(await snapshot(), before);
    assert.equal((await call(manager)).body.data.services.length, 0);
  });
  await t.test('one order despite multiple steps and linked plan; source closure wins', async () => {
    await reset(); const o = oid(), hp = oid();
    await Order.collection.insertOne({ _id: o, user: p, serviceName: '合成订单', status: 'scheduled', paymentStatus: 'paid', tradeStatus: 'paid', currentAssignee: manager._id });
    await Plan.collection.insertOne({ _id: hp, patientId: p, title: '关联方案', status: 'active', sourceOrderId: o });
    await task({ sourceOrderId: o, taskRole: 'supervisor', assignedTo: planner._id });
    await task({ sourceOrderId: o, taskRole: 'executor' });
    await task({ sourceHealthPlanId: hp, taskRole: 'executor', isBlocked: true });
    let rows = await loadServices(advisor); assert.equal(rows.length, 1); assert.equal(rows[0].current.length, 1);
    await Order.collection.updateOne({ _id: o }, { $set: { status: 'cancelled' } }); assert.equal((await loadServices(advisor)).length, 0);
    await task({ sourceType: 'order', sourceOrderId: o, sourceScheduleKey: 'medical_escort_followup:independent' });
    assert.equal((await loadServices(advisor)).length, 1);
  });
  await t.test('standalone plans, insurance and services without tasks are covered', async () => {
    await reset(); await Plan.collection.insertMany([{ _id: oid(), patientId: p, title: '已生效营养方案', status: 'active', currentAssignee: manager._id }, { _id: oid(), patientId: p, title: '草稿', status: 'draft' }]);
    await Insurance.collection.insertOne({ _id: oid(), patientId: p, title: '保险', status: 'reviewing', assignedTo: manager._id });
    const rows = await loadServices(advisor); assert.equal(rows.length, 2); assert.ok(rows.every(r => r.current[0].person.id === String(manager._id)));
  });
  await t.test('CareFlow uses actual stage owner and disappears on finalized only', async () => {
    await reset(); const f = oid(), parent = await task({ _id: f, taskRole: 'supervisor', assignedTo: planner._id, careFlowId: f });
    await task({ careFlowId: f, workflowKey: 'care_flow:booking' });
    await Flow.collection.insertOne({ _id: f, tenantId: tenant, patientId: p, parentId: parent._id, state: { stage: 'booking', title: '合成就医', people: { healthManager: { id: String(manager._id) }, healthPlanner: { id: String(planner._id) } } } });
    let rows = await loadServices(advisor); assert.equal(rows.length, 1); assert.equal(rows[0].current[0].label, '健管预约');
    await Flow.collection.updateOne({ _id: f }, { $set: { 'state.stage': 'closed' } }); assert.equal((await loadServices(advisor)).length, 1);
    await Flow.collection.updateOne({ _id: f }, { $set: { 'state.finalized': true } }); assert.equal((await loadServices(advisor)).length, 0);
  });
  await t.test('annual service item and direct dispatch merge, separate items stay separate', async () => {
    await reset(); const annual = oid(), execution = oid();
    await task({ sourceAnnualPlanId: annual, sourceType: 'scheduled', sourceScheduleKey: 'vaccine:2026-10-01:疫苗' });
    await task({ sourceAnnualPlanId: annual, sourceType: 'annual_service', workflowKey: 'service_request', sourceScheduleKey: 'service-request:vaccine:0:2026-10-01', taskRole: 'supervisor', formData: { serviceRequest: { moduleKey: 'vaccine', itemSnapshot: { name: '疫苗' } } }, annualDispatch: { executionId: String(execution) } });
    await task({ _id: execution, sourceAnnualPlanId: annual, sourceScheduleKey: 'dispatch-execute:other', coordinationGroupId: 'annual-assistance:other' });
    await task({ sourceAnnualPlanId: annual, sourceScheduleKey: 'vaccine:2026-10-02:第二项' });
    assert.equal((await loadServices(advisor)).length, 2);
  });
  await t.test('remind/coordinate reach correct people, concurrency dedupes and never writes source', async () => {
    await reset(); await task(); const row = (await call(advisor)).body.data.services[0], before = await snapshot();
    const payload = { serviceKey: row.key, version: row.version, kind: 'remind', recipientId: String(manager._id), note: '请核对实际进度' };
    assert.equal((await call(stranger, '/requests', payload)).status, 404);
    assert.equal((await call(manager, '/requests', payload)).status, 403);
    assert.equal((await call(advisor, '/requests', { ...payload, recipientId: String(planner._id) })).status, 409);
    const sent = await Promise.all(Array.from({ length: 6 }, () => call(advisor, '/requests', payload)));
    assert.ok(sent.every(r => r.status === 200)); assert.equal(await Request.countDocuments(), 1);
    let received = (await call(manager)).body.data.inbox; assert.equal(received.length, 1);
    assert.equal((await call(manager, `/tasks/${row.taskId}`)).status, 200);
    assert.equal((await call(planner, `/requests/${received[0]._id}/respond`, { response: '越权' })).status, 409);
    assert.equal((await call(manager, `/requests/${received[0]._id}/respond`, { response: '' })).status, 400);
    assert.equal((await call(manager, `/requests/${received[0]._id}/respond`, { response: '已联系，待确认时间' })).status, 200);
    assert.equal((await call(manager)).body.data.inbox.length, 0);
    assert.equal((await call(advisor)).body.data.services[0].history[0].response, '已联系，待确认时间');
    assert.equal((await call(advisor, '/requests', { ...payload, kind: 'coordinate', recipientId: String(planner._id) })).status, 200);
    assert.equal((await call(planner)).body.data.inbox.length, 1); assert.equal(await snapshot(), before);
  });
  await t.test('stale version, disabled staff, terminal source and changed responsibility are safe', async () => {
    await reset(); const original = await task(); let row = (await call(advisor)).body.data.services[0];
    const payload = { serviceKey: row.key, version: row.version, kind: 'remind', recipientId: String(manager._id), note: '请跟进' };
    assert.equal((await call(advisor, '/requests', { ...payload, version: 'old' })).status, 409);
    await call(advisor, '/requests', payload);
    await Task.collection.updateOne({ _id: original._id }, { $set: { assignedTo: planner._id } }); assert.equal((await call(manager)).body.data.inbox.length, 0);
    await Task.collection.updateOne({ _id: original._id }, { $set: { status: 'completed' } }); assert.equal((await call(advisor)).body.data.services.length, 0);
    assert.equal(await Request.countDocuments(), 1);
    await Admin.collection.updateOne({ _id: advisor._id }, { $set: { staffStatus: 'inactive' } }); assert.equal((await call(advisor)).status, 403);
  });
});
