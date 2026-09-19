const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const Plan = require('../src/models/AnnualPlan');
const User = require('../src/models/User');
const Period = require('../src/models/AnnualServicePeriod');
const Order = require('../src/models/Order');
const ids = { plan: '000000000000000000000001', patient: '000000000000000000000002', planner: '000000000000000000000003', old: '000000000000000000000004', order: '000000000000000000000005' };
let actor;
const auth = require.resolve('../src/middleware/staffAuth'); require(auth);
require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/annualServicePeriods');
const body = patch => ({ sourceType: 'offline_contract', contractReference: 'C-2099', verified: true, startDate: '2099-01-01', endDate: '2099-12-31', ...patch });
function setup(t, { existing = null, order = null } = {}) {
  actor = { _id: ids.planner, role: 'healthPlanner' };
  const plan = { _id: ids.plan, patientId: ids.patient, year: 2099, confirmedAt: new Date(), pushedAt: new Date(), reviewStatus: 'approved', continuitySource: { previousPlanId: ids.old } };
  t.mock.method(Plan, 'findById', () => ({ lean: async () => plan }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: ids.patient, assignedHealthPlanner: ids.planner, assignedFamilyDoctor: ids.planner, assignedHealthManager: ids.planner }) }) }));
  t.mock.method(Period, 'findOne', q => ({ lean: async () => q.annualPlanId === ids.old ? null : existing }));
  t.mock.method(Period, 'create', async row => (existing = { _id: 'period', ...row }));
  t.mock.method(Order, 'findById', () => ({ lean: async () => order }));
  t.mock.method(Order, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => order ? [order] : [] }) }) }));
}
async function request(t, method, input, id = ids.plan, suffix = '') {
  const app = express(); app.use(express.json()); app.use(router);
  const server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/annual-plans/${id}/service-period${suffix}`, { method, headers: { 'Content-Type': 'application/json' }, ...(input ? { body: JSON.stringify(input) } : {}) });
  return { status: response.status, body: await response.json() };
}
test('续约入口拒绝非法ID、其他客户人员和无权限岗位', async t => {
  setup(t);
  assert.equal((await request(t, 'GET', null, 'bad-id')).status, 400);
  actor = { _id: ids.old, role: 'healthPlanner' };
  assert.equal((await request(t, 'GET')).status, 403);
  actor = { _id: ids.planner, role: 'nutritionist' };
  assert.equal((await request(t, 'POST', body())).status, 403);
});
test('所属顾问可查看但不可代替规划师确认线下合同', async t => {
  setup(t); actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t, 'GET')).status, 200);
  assert.equal((await request(t, 'POST', body())).status, 403);
});
test('未来服务期可留凭据，但不提前派发任务', async t => {
  setup(t);
  const result = await request(t, 'POST', body());
  assert.equal(result.status, 200); assert.equal(result.body.data.period.confirmedBy, ids.planner);
  assert.equal(result.body.data.activation.allowed, false); assert.match(result.body.data.activation.reason, /服务期开始/);
  assert.equal((await request(t, 'POST', body())).status, 200);
  assert.equal((await request(t, 'POST', body({ contractReference: 'changed' }))).status, 409);
});
test('订单接口过滤未支付订单，拒绝不合格订单和无效ID', async t => {
  setup(t, { order: { _id: ids.order, user: ids.patient, orderType: 'package', paymentStatus: 'pending', serviceId: 'pkg_1y' } });
  assert.deepEqual((await request(t, 'GET')).body.data.orders, []);
  assert.equal((await request(t, 'POST', body({ sourceType: 'paid_order', sourceOrderId: 'bad' }))).status, 400);
  assert.equal((await request(t, 'POST', body({ sourceType: 'paid_order', sourceOrderId: ids.order }))).status, 409);
});
test('凭据唯一索引冲突返回可处理的409，不吞成成功', async t => {
  setup(t); t.mock.method(Period, 'create', async () => { throw Object.assign(Error('duplicate'), { code: 11000 }); });
  assert.equal((await request(t, 'POST', body())).status, 409);
});
test('重试仅所属规划师或顾问可操作，忽略请求中的方案与合同替换', async t => {
  setup(t); let calls = 0;
  t.mock.method(require('../src/utils/annualPlanTaskSplit'), 'syncAnnualPlanTaskSplit', async plan => {
    calls++; assert.equal(plan._id, ids.plan); assert.equal(plan.moduleData, undefined); return { warnings: [] };
  });
  actor = { _id: ids.planner, role: 'healthManager' };
  assert.equal((await request(t, 'POST', {}, ids.plan, '/retry')).status, 403);
  actor = { _id: ids.old, role: 'familyDoctor' };
  assert.equal((await request(t, 'POST', {}, ids.plan, '/retry')).status, 403);
  actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t, 'POST', { moduleData: { changed: true }, contractReference: 'untrusted' }, ids.plan, '/retry')).status, 200);
  assert.equal(calls, 1);
});

function setupCorrection(t) {
  const existing = { _id: 'period', annualPlanId: ids.plan, patientId: ids.patient, ...body(), evidenceSnapshot: { verifiedByPlanner: true }, confirmedAt: new Date(), confirmedBy: ids.planner };
  setup(t, { existing });
  t.mock.method(Period, 'findOne', query => ({ lean: async () => query.annualPlanId === ids.plan ? structuredClone(existing) : null }));
  for (const name of ['Task', 'FollowUp', 'RecurringSupplyPlan']) t.mock.method(require(`../src/models/${name}`), 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(Period, 'updateOne', async (query, update) => {
    assert.equal(query._id, 'period');
    Object.assign(existing, update.$set); existing.correctionRevision = (existing.correctionRevision || 0) + 1;
    (existing.correctionHistory ||= []).push(update.$push.correctionHistory);
    return { matchedCount: 1 };
  });
  return existing;
}
test('更正HTTP链路：提交、刷新、顾问审核，仅变更审计且GET可查看', async t => {
  const period = setupCorrection(t);
  assert.equal((await request(t, 'POST', body({ expectedRevision: 0, contractReference: 'CORRECTED', reason: '编号录入有误' }), ids.plan, '/corrections')).status, 200);
  const base = { correctionId: period.correction.id, expectedRevision: 1 };
  assert.equal((await request(t, 'POST', { ...base, decision: 'approve', impactAcknowledged: true }, ids.plan, '/corrections/review')).status, 403);
  actor = { _id: ids.planner, role: 'familyDoctor' };
  assert.equal((await request(t, 'POST', base, ids.plan, '/corrections/refresh-impact')).status, 200);
  assert.equal((await request(t, 'POST', { ...base, expectedRevision: 2, decision: 'approve', impactAcknowledged: true, moduleData: { changed: true } }, ids.plan, '/corrections/review')).status, 200);
  const result = (await request(t, 'GET')).body.data.period;
  assert.equal(result.contractReference, 'C-2099'); assert.equal(result.correction.status, 'approved_pending_apply'); assert.equal(result.correctionHistory.length, 3);
});
test('更正HTTP拒绝他人及非法订单，规划师可撤回自己的待审申请', async t => {
  const period = setupCorrection(t);
  assert.equal((await request(t, 'POST', body({ sourceType: 'paid_order', sourceOrderId: 'bad' }), ids.plan, '/corrections')).status, 400);
  actor = { _id: ids.old, role: 'healthPlanner' };
  assert.equal((await request(t, 'POST', body(), ids.plan, '/corrections')).status, 403);
  actor = { _id: ids.planner, role: 'healthPlanner' };
  await request(t, 'POST', body({ expectedRevision: 0, contractReference: 'CORRECTED', reason: '编号错误' }), ids.plan, '/corrections');
  assert.equal((await request(t, 'POST', { expectedRevision: 1, correctionId: period.correction.id }, ids.plan, '/corrections/withdraw')).status, 200);
  assert.equal(period.correction.status, 'withdrawn'); assert.equal(period.contractReference, 'C-2099');
});
