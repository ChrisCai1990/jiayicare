const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('human workbench queries real isolated Mongo through authenticated staff routes', { skip: process.env.WORKBENCH_TEST_MONGO !== '1' }, async t => {
  const mongoose = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const database = 'human_workbench_test_' + crypto.randomBytes(8).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27961/' + database, { serverSelectionTimeoutMS: 4000 });
  const app = express(); app.use(express.json()); app.use('/staff', require('../src/routes/staff'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); });
  const Admin = require('../src/models/Admin'), User = require('../src/models/User'), FollowUp = require('../src/models/FollowUp'), Report = require('../src/models/MedicalReport');
  const doctor = await Admin.create({ username: database + '_doctor', name: '验收顾问', role: 'familyDoctor', password: crypto.randomBytes(20).toString('hex') });
  const manager = await Admin.create({ username: database + '_manager', name: '验收健管', role: 'healthManager', password: crypto.randomBytes(20).toString('hex') });
  const patient = await User.create({ name: '验收客户', phone: '19900002961', assignedFamilyDoctor: doctor._id, assignedHealthManager: manager._id });
  const other = await User.create({ name: '其他客户', phone: '19900002962' });
  const call = async (actor, path = '/ai-todos') => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/staff${path}`, { headers: actor ? { Authorization: 'Bearer ' + jwt.sign({ type: 'admin', id: String(actor._id) }, process.env.JWT_SECRET) } : {} });
    return { status: r.status, body: await r.json() };
  };
  await t.test('authentication and complete review queue beyond the old cap', async () => {
    assert.equal((await call(null)).status, 401);
    await FollowUp.insertMany([
      ...Array.from({ length: 60 }, () => ({ staffId: doctor._id, patientId: other._id, aiStatus: 'pending', date: new Date('2025-01-01') })),
      ...Array.from({ length: 65 }, () => ({ staffId: doctor._id, patientId: patient._id, aiStatus: 'pending', reviewRole: 'familyDoctor', date: new Date('2026-01-01') })),
    ]);
    const r = await call(doctor); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.filter(row => row.type === 'followup_review').length, 65);
    assert.ok(r.body.data.every(row => row.patientId === String(patient._id)));
  });
  await t.test('failed report stays visible, audited report disappears', async () => {
    const report = await Report.create({ user: patient._id, title: '验收报告', aiStatus: 'failed', fileUrl: 'https://example.test/report', audit_status: 'unaudited' });
    let r = await call(manager); assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.ok(r.body.data.some(row => row.id === 'reportparse_' + report._id && row.label.includes('失败')));
    await Report.updateOne({ _id: report._id }, { $set: { aiStatus: 'reviewed', audit_status: 'audited' } });
    r = await call(manager); assert.ok(!r.body.data.some(row => row.id === 'reportparse_' + report._id));
  });
  await t.test('explicit handoff survives patient ownership change and disappears on completion', async () => {
    const task = await FollowUp.create({ patientId: other._id, staffId: manager._id, assignedTo: manager._id, status: 'planned', tags: ['微信客服', '需人工接管'] });
    assert.ok((await call(manager)).body.data.some(row => row.id === 'wecomkf_' + task._id));
    assert.ok(!(await call(doctor)).body.data.some(row => row.id === 'wecomkf_' + task._id));
    await FollowUp.updateOne({ _id: task._id }, { $set: { status: 'completed' } });
    assert.ok(!(await call(manager)).body.data.some(row => row.id === 'wecomkf_' + task._id));
  });
  await t.test('active service queue is not truncated at 100 or hidden behind completed history', async () => {
    await FollowUp.insertMany(Array.from({ length: 105 }, () => ({ staffId: doctor._id, assignedTo: doctor._id,
      patientId: patient._id, sourceType: 'health_plan', taskRole: 'executor', status: 'planned', date: new Date('2026-09-29') })));
    const r = await call(doctor, '/service-tasks?status=active&includeFuture=1&limit=100');
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.length, 105);
  });
  await t.test('old-year AI result remains pending despite newer approved results', async () => {
    const draft = { scope: 'doctor', generatedAt: '2025-09-01T00:00:00Z', sections: { medical_priority: { summary: '验收草稿' } } };
    await User.collection.updateOne({ _id: patient._id }, { $set: { aiHealthSummary: { byYear: { 2025: { records: [draft] }, 2026: { records: [{ ...draft, doctorApprovedAt: new Date() }] } } } } });
    const r = await call(doctor); assert.equal(r.status, 200, JSON.stringify(r.body));
    const summary = r.body.data.filter(row => row.type === 'summary_review');
    assert.equal(summary.length, 1); assert.match(summary[0].link, /aiYear=2025/);
  });
});
