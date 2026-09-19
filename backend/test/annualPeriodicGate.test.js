const test = require('node:test');
const assert = require('node:assert/strict');
const access = require('../src/utils/serviceAccess');
const annual = require('../src/utils/annualServicePeriod');
const AnnualPlan = require('../src/models/AnnualPlan');
const { annualPeriodicGate, canStartAnnualSupplyCycle } = require('../src/utils/annualPeriodicGate');
const user = { _id: 'u', serviceExpiry: '2025-01-01' };
const plan = { _id: 'p', patientId: 'u', confirmedAt: '2026-01-01', continuitySource: { previousPlanId: 'old' } };
const period = { startDate: '2026-09-01', endDate: '2027-08-31' };
const now = new Date('2026-09-19T12:00:00+08:00');
test.beforeEach(t => {
  t.mock.method(access, 'resolveServiceAccess', async () => ({ active: true, source: 'verified_renewal', ...period }));
  t.mock.method(annual, 'annualExecutionGate', async () => ({ allowed: true, period, anchor: '2026-09-01' }));
  t.mock.method(AnnualPlan, 'findById', () => ({ lean: async () => plan }));
});
test('可信续约可用，不再被旧档案到期日拦截', async () => {
  const gate = await annualPeriodicGate(plan, user, now);
  assert.equal(gate.allowed, true); assert.equal(gate.anchor, '2026-09-01');
});
test('下一年度生效不能续开旧年度周期', async () => {
  assert.equal((await annualPeriodicGate({ ...plan, continuitySource: null }, user, now)).allowed, false);
});
test('未进入续年期的旧年度保留原有效服务窗口', async t => {
  t.mock.method(access, 'resolveServiceAccess', async () => ({ active: true, source: 'legacy', endDate: '2026-12-31' }));
  assert.equal((await annualPeriodicGate({ ...plan, continuitySource: null }, user, now)).allowed, true);
});
test('到期、断档、退款等无有效权益时不再启动新周期', async t => {
  t.mock.method(access, 'resolveServiceAccess', async () => ({ active: false, source: 'verified_renewal' }));
  assert.equal((await annualPeriodicGate(plan, user, now)).allowed, false);
  assert.equal(annual.annualExecutionGate.mock.callCount(), 0);
});
test('有效权益也不能绕过来源方案审核/确认/服务期门槛', async t => {
  t.mock.method(annual, 'annualExecutionGate', async () => ({ allowed: false, reason: '等待客户确认' }));
  assert.equal((await annualPeriodicGate(plan, user, now)).allowed, false);
});
test('来源缺失或客户不匹配时不调用权益查询', async () => {
  for (const source of [null, { ...plan, patientId: 'other' }]) assert.equal((await annualPeriodicGate(source, user, now)).allowed, false);
  assert.equal(access.resolveServiceAccess.mock.callCount(), 0);
});
test('年度补给到期日必须在来源年度内，含首尾日', async () => {
  for (const [day, expected] of [['2026-08-31', false], ['2026-09-01', true], ['2027-08-31', true], ['2027-09-01', false], ['invalid', false]]) {
    assert.equal(await canStartAnnualSupplyCycle({ sourceAnnualPlanId: 'p', nextDueDate: day }, user, now), expected, day);
  }
});
test('独立订单/人工补给不受年度方案门槛误伤', async () => {
  assert.equal(await canStartAnnualSupplyCycle({ sourceOrderId: 'order' }, user, now), true);
  assert.equal(AnnualPlan.findById.mock.callCount(), 0);
});
test('凭据查询异常必须上抛，不能默认放行', async t => {
  t.mock.method(access, 'resolveServiceAccess', async () => { throw Error('database unavailable'); });
  await assert.rejects(canStartAnnualSupplyCycle({ sourceAnnualPlanId: 'p' }, user, now), /database unavailable/);
});
