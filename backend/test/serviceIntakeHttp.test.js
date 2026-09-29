const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

test('public lead to service intake uses real isolated Mongo/HTTP, role gates and original service records', { skip: process.env.SERVICE_INTAKE_TEST_MONGO !== '1' }, async t => {
  const mongoose = require('mongoose'), express = require('express'), jwt = require('jsonwebtoken');
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const name = 'service_intake_test_' + crypto.randomBytes(8).toString('hex');
  await mongoose.connect('mongodb://127.0.0.1:27961/' + name, { serverSelectionTimeoutMS: 4000 });
  const Admin = require('../src/models/Admin'), User = require('../src/models/User');
  const Lead = require('../src/models/VisitorLead'), Intake = require('../src/models/ServiceIntake');
  const Order = require('../src/models/Order'), Plan = require('../src/models/HealthPlan'), FollowUp = require('../src/models/FollowUp');
  await Promise.all([Admin.init(), User.init(), Lead.init(), Intake.init(), Order.init(), Plan.init(), FollowUp.init()]);
  const pass = crypto.randomBytes(20).toString('hex');
  const actor = (username, role, extra = {}) => Admin.create({ username: username + name, name: username, role, password: pass, ...extra });
  const planner = await actor('规划师甲', 'healthPlanner'), other = await actor('规划师乙', 'healthPlanner');
  const doctor = await actor('顾问', 'familyDoctor'), outsider = await actor('其他机构', 'superadmin', { tenantId: new mongoose.Types.ObjectId() });
  const user = await User.create({ name: '虚构验收客户', phone: '19900002791', assignedHealthPlanner: planner._id });
  const user2 = await User.create({ name: '其他客户', phone: '19900002792', assignedHealthPlanner: other._id });
  const app = express(); app.use(express.json());
  app.use('/public', require('../src/routes/visitorAssistant'));
  app.use('/staff', require('../src/routes/visitorLeads')({ getVisiblePlanPatientIds: async staff => staff.role === 'superadmin' ? null : (await User.find({ assignedHealthPlanner: staff._id }).select('_id')).map(r => r._id) }));
  // Prove mounting the router does not impose lead-specific roles on unrelated marketing routes.
  app.get('/staff/activities', (req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  async function call(who, path, method = 'GET', body) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: 'Bearer ' + jwt.sign({ type: 'admin', id: String(who._id) }, process.env.JWT_SECRET) } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  }
  const publicInput = { consent: true, name: '虚构咨询人', phone: '19900002791', topic: '就医协助服务', summary: '希望了解预约准备流程', source: 'corporate_start_service', requestId: crypto.randomBytes(16).toString('hex') };
  let leadId, intake, order, plan, task;
  await t.test('repeated public handoff creates exactly one lead, no customer or order', async () => {
    const out = await Promise.all(Array.from({ length: 8 }, () => call(null, '/public/handoff', 'POST', publicInput)));
    assert.ok(out.every(r => r.status === 201)); leadId = out[0].body.data.id;
    assert.ok(out.every(r => r.body.data.id === leadId)); assert.equal(await Lead.countDocuments(), 1);
    assert.equal(await Order.countDocuments(), 0); assert.equal(await Intake.countDocuments(), 0); assert.equal(await User.countDocuments(), 2);
  });
  await t.test('access, tenancy and unrelated-route boundaries', async () => {
    assert.equal((await call(null, '/staff/visitor-leads')).status, 401);
    assert.equal((await call(doctor, '/staff/visitor-leads')).status, 403);
    assert.equal((await call(outsider, '/staff/visitor-leads')).body.data.length, 0);
    assert.equal((await call(doctor, '/staff/activities')).body.ok, true);
  });
  const contact = async () => { const row = await Lead.findById(leadId); return call(planner, '/staff/visitor-leads/' + leadId, 'PATCH', { status: 'contacted', contactNote: '已核实本人需求', baseUpdatedAt: row.updatedAt.toISOString() }); };
  const convert = () => ({ patientId: String(user._id), need: '安排一次就医协助服务', serviceDirection: 'medical_assistance', customerConfirmed: true, nextContactAt: new Date(Date.now() + 86400000).toISOString() });
  await t.test('explicit confirmation, patient visibility and lead ownership are mandatory', async () => {
    assert.equal((await call(planner, '/staff/visitor-leads/' + leadId + '/convert', 'POST', convert())).status, 400);
    assert.equal((await contact()).status, 200);
    assert.equal((await call(other, '/staff/visitor-leads/' + leadId + '/convert', 'POST', convert())).status, 403);
    assert.equal((await call(planner, '/staff/visitor-leads/' + leadId + '/convert', 'POST', { ...convert(), customerConfirmed: false })).status, 400);
    assert.equal((await call(planner, '/staff/visitor-leads/' + leadId + '/convert', 'POST', { ...convert(), patientId: String(user2._id) })).status, 403);
  });
  await t.test('concurrent conversion and interrupted write retry preserve one original intake', async () => {
    const original = Intake.create;
    Intake.create = async () => { throw new Error('simulated process failure before durable target'); };
    try { assert.equal((await call(planner, '/staff/visitor-leads/' + leadId + '/convert', 'POST', convert())).status, 500); }
    finally { Intake.create = original; }
    assert.ok((await Lead.findById(leadId)).acceptance);
    assert.equal((await contact()).status, 409);
    const out = await Promise.all(Array.from({ length: 5 }, () => call(planner, '/staff/visitor-leads/' + leadId + '/convert', 'POST', convert())));
    assert.ok(out.some(r => [200, 201].includes(r.status))); assert.ok(out.every(r => [200, 201, 409].includes(r.status)));
    assert.equal(await Intake.countDocuments(), 1);
    intake = (await call(planner, '/staff/service-intakes')).body.data[0];
    assert.equal(intake.source, publicInput.source); assert.equal(intake.need, '安排一次就医协助服务');
    assert.equal(await FollowUp.countDocuments(), 0); assert.equal(await Order.countDocuments(), 0);
  });
  await t.test('workbench projects open intake, links exact record and enforces role and tenant gates', async () => {
    assert.equal((await call(null, '/staff/visitor-leads/workbench')).status, 401);
    assert.equal((await call(doctor, '/staff/visitor-leads/workbench')).status, 403);
    assert.equal((await call(outsider, '/staff/visitor-leads/workbench')).body.total, 0);
    const output = await call(planner, '/staff/visitor-leads/workbench');
    assert.equal(output.status, 200); assert.equal(output.body.total, 1);
    assert.equal(output.body.data[0].id, 'intake_' + leadId);
    assert.match(output.body.data[0].link, /workbench=intakes/);
    const exact = await call(planner, '/staff/service-intakes?itemId=' + leadId);
    assert.equal(exact.body.total, 1);
    assert.equal((await call(other, '/staff/service-intakes?itemId=' + leadId)).body.total, 0);
    assert.equal((await call(planner, '/staff/service-intakes?itemId=invalid')).status, 400);
  });
  await t.test('service link checks patient and plan/order consistency, does not create business records', async () => {
    order = await Order.create({ user: user._id, serviceId: 'test', serviceName: '虚构就医服务', paymentStatus: 'paid', tradeStatus: 'paid' });
    const wrongOrder = await Order.create({ user: user2._id, serviceId: 'test', serviceName: '其他客户服务' });
    plan = await Plan.create({ patientId: user._id, staffId: planner._id, type: 'medical_assist', title: '虚构服务方案', sourceOrderId: order._id, status: 'active' });
    const body = { action: 'link', revision: intake.revision, note: '确认本次服务关联' };
    assert.equal((await call(planner, '/staff/service-intakes/' + intake._id, 'PATCH', { ...body, orderId: String(wrongOrder._id) })).status, 403);
    assert.equal((await call(planner, '/staff/service-intakes/' + intake._id, 'PATCH', { ...body, planId: String(plan._id) })).status, 400);
    const r = await call(planner, '/staff/service-intakes/' + intake._id, 'PATCH', { ...body, orderId: String(order._id), planId: String(plan._id) });
    assert.equal(r.status, 200); intake = r.body.data;
    assert.equal(await Order.countDocuments(), 2); assert.equal(await Plan.countDocuments(), 1);
  });
  await t.test('order linking closes consultation immediately without ending order or its tasks', async () => {
    assert.equal(intake.status, 'closed');
    assert.equal((await Order.findById(order._id)).tradeStatus, 'paid');
    task = await FollowUp.create({ staffId: planner._id, assignedTo: planner._id, patientId: user._id, sourceOrderId: order._id, status: 'planned', theme: '待回收资料' });
    const rows = (await call(planner, '/staff/service-intakes?status=closed')).body.data;
    assert.equal(rows.length, 1); assert.equal(rows[0].progress.stage, '已转入订单流程');
    assert.equal((await call(planner, '/staff/service-intakes?status=open')).body.total, 0);
    const retry = await call(planner, '/staff/service-intakes/' + intake._id, 'PATCH', {action:'followup',revision:intake.revision,note:'不应重新跟进'});
    assert.equal(retry.status,409);
    assert.equal((await FollowUp.findById(task._id)).status,'planned');
  });
  await t.test('closed intake removes its workbench reminder without resurrecting the source lead', async () => {
    assert.equal((await call(planner, '/staff/visitor-leads/workbench')).body.total, 0);
  });
  await t.test('intake remains traceable after public-lead retention and respects reassignment', async () => {
    await Lead.deleteOne({ _id: leadId });
    const r = await call(planner, '/staff/service-intakes');
    assert.equal(r.body.data[0].source, publicInput.source);
    assert.equal((await call(other, '/staff/service-intakes')).body.data.length, 0);
    await User.updateOne({ _id: user._id }, { $set: { assignedHealthPlanner: other._id } });
    assert.equal((await call(planner, '/staff/service-intakes')).body.data.length, 0);
  });
});
