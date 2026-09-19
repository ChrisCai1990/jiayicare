const test = require('node:test');
const assert = require('node:assert/strict');
const { isPaidAnnualOrder, validatePeriodDates, validatePlanPeriodDates, confirmAnnualServicePeriod, annualExecutionGate } = require('../src/utils/annualServicePeriod');
const plan = patch => ({ _id: 'new', patientId: 'patient', year: 2027, confirmedAt: new Date('2026-12-20'), pushedAt: new Date('2026-12-19'), reviewStatus: 'approved', continuitySource: { previousPlanId: 'old' }, ...patch });
const order = patch => ({ _id: 'order', user: 'patient', orderType: 'package', paymentStatus: 'paid', annualServiceSnapshot: { durationMonths: 12 }, ...patch });
const period = patch => ({ _id: 'period', sourceType: 'offline_contract', contractReference: 'C-2027', startDate: '2027-01-01', endDate: '2027-12-31', confirmedAt: new Date(), ...patch });
function models(record = period(), paidOrder = order()) {
  return { Period: { findOne: () => ({ lean: async () => record }) }, Order: { findById: () => ({ lean: async () => paidOrder }) } };
}
const input = patch => ({ sourceType: 'offline_contract', contractReference: 'C-2027', verified: true, startDate: '2027-01-01', endDate: '2027-12-31', ...patch });
const args = patch => ({ plan: plan(), patient: { _id: 'patient', assignedHealthPlanner: 'planner' }, staff: { _id: 'planner', role: 'healthPlanner' }, input: input(), ...patch });
test('订单只认该客户已支付年度快照，兼容明确的旧年度代码', () => {
  assert.equal(isPaidAnnualOrder(order(), 'patient'), true);
  assert.equal(isPaidAnnualOrder(order({ annualServiceSnapshot: null, serviceId: 'pkg_1y' }), 'patient'), true);
  for (const patch of [{ user: 'other' }, { orderType: 'service' }, { paymentStatus: 'pending' }, { status: 'cancelled' }, { tradeStatus: 'refunded' }, { tradeStatus: 'refund_pending' }, { tradeStatus: 'partially_refunded' }, { refundStatus: 'approved' }, { annualServiceSnapshot: { durationMonths: 6 }, serviceId: 'pkg_1y' }, { annualServiceSnapshot: null, serviceId: 'unknown', serviceName: '年度' }]) assert.equal(isPaidAnnualOrder(order(patch), 'patient'), false);
});
test('日期严格有效、匹配年度且包含365/366天，不推测合同期限', () => {
  assert.doesNotThrow(() => validatePeriodDates('2027-09-01', '2028-08-31', 2027));
  for (const dates of [['2027-02-30', '2028-02-28', 2027], ['2027-01-01', '2027-12-30', 2027], ['2027-01-01', '2027-12-31', 2028], ['2027-12-31', '2027-01-01', 2027]]) assert.throws(() => validatePeriodDates(...dates));
});
test('计划确定日期越界阻止启用，描述性排期及停用模块不误判', () => {
  assert.throws(() => validatePlanPeriodDates({ moduleData: { medical_treatment: { records: [{ visit_time: '2026-12-01' }] } } }, '2027-01-01', '2027-12-31'));
  assert.doesNotThrow(() => validatePlanPeriodDates({ moduleData: { a: { records: [{ time: '确认后3天' }] }, b: { enabled: false, date: '2026-12-01' } } }, '2027-01-01', '2027-12-31'));
});
test('线下合同仅所属规划师确认且必须明确核验，保存审计', async () => {
  const fake = models(null); let saved;
  fake.Period.create = async row => (saved = row);
  const result = await confirmAnnualServicePeriod(args(), fake);
  assert.equal(result.confirmedBy, 'planner'); assert.equal(saved.evidenceSnapshot.verifiedByPlanner, true);
  for (const staff of [{ _id: 'other', role: 'healthPlanner' }, { _id: 'planner', role: 'familyDoctor' }, { _id: 'planner', role: 'healthManager' }]) await assert.rejects(confirmAnnualServicePeriod(args({ staff }), fake), { statusCode: 403 });
  await assert.rejects(confirmAnnualServicePeriod(args({ input: input({ verified: false }) }), fake), /核验/);
});
test('普通到期日期、首次方案及他人订单不构成续约凭据', async () => {
  const fake = models(null, order({ user: 'other' }));
  await assert.rejects(confirmAnnualServicePeriod(args({ plan: plan({ continuitySource: null }) }), fake), /首次/);
  await assert.rejects(confirmAnnualServicePeriod(args({ input: input({ sourceType: 'paid_order', sourceOrderId: 'order' }) }), fake), /已支付/);
  const gate = await annualExecutionGate(plan({ serviceExpiry: '2099-12-31' }), new Date('2027-05-01'), fake);
  assert.equal(gate.allowed, false); assert.match(gate.reason, /凭据/);
});
test('已支付年度订单保存付款快照，不改订单及档案', async () => {
  const fake = models(null); let saved;
  fake.Period.create = async row => (saved = row);
  await confirmAnnualServicePeriod(args({ input: input({ sourceType: 'paid_order', sourceOrderId: 'order' }) }), fake);
  assert.equal(saved.sourceOrderId, 'order'); assert.equal(saved.evidenceSnapshot.paymentStatus, 'paid');
  assert.equal(saved.contractReference, '');
});
test('重复确认返回原记录，不允许覆盖，服务期不得重叠', async () => {
  const existing = period();
  const fake = models(); fake.Period.findOne = q => ({ lean: async () => q.annualPlanId === 'old' ? null : existing });
  assert.equal(await confirmAnnualServicePeriod(args(), fake), existing);
  await assert.rejects(confirmAnnualServicePeriod(args({ input: input({ contractReference: 'changed' }) }), fake), /不能覆盖/);
  fake.Period.findOne = () => ({ lean: async () => period({ endDate: '2027-01-01' }) });
  await assert.rejects(confirmAnnualServicePeriod(args(), fake), /重叠/);
});
test('启用同时要求发布、客户确认、凭据、生效时间；首次链路兼容', async () => {
  for (const patch of [{ confirmedAt: null }, { reviewStatus: 'pending' }, { pushedAt: null }]) assert.equal((await annualExecutionGate(plan(patch), new Date('2027-05-01'), models())).allowed, false);
  assert.equal((await annualExecutionGate(plan(), new Date('2026-12-31T15:59:59Z'), models())).allowed, false);
  const enabled = await annualExecutionGate(plan(), new Date('2026-12-31T16:00:00Z'), models());
  assert.equal(enabled.allowed, true); assert.equal(enabled.anchor.toISOString(), '2026-12-31T16:00:00.000Z');
  assert.equal((await annualExecutionGate(plan(), new Date('2027-12-31T15:59:59Z'), models())).allowed, true);
  assert.equal((await annualExecutionGate(plan(), new Date('2027-12-31T16:00:00Z'), models())).allowed, false);
  assert.equal((await annualExecutionGate(plan({ continuitySource: null }), new Date(), {})).allowed, true);
});
test('退款后不再派新任务；客户较晚确认时以确认时间为排期基准', async () => {
  const paid = period({ sourceType: 'paid_order', sourceOrderId: 'order' });
  assert.equal((await annualExecutionGate(plan(), new Date('2027-05-01'), models(paid, order({ paymentStatus: 'refunded' })))).allowed, false);
  const enabled = await annualExecutionGate(plan({ confirmedAt: new Date('2027-02-01') }), new Date('2027-05-01'), models(paid));
  assert.equal(enabled.anchor.toISOString(), '2027-02-01T00:00:00.000Z');
});
test('需人工处置的门槛异常包含准确岗位，服务未开始不算异常', async () => {
  const invalidOrder = await annualExecutionGate(plan(), new Date('2027-05-01'), models(period({ sourceType: 'paid_order' }), order({ tradeStatus: 'refunded' })));
  assert.equal(invalidOrder.issue.role, 'healthPlanner');
  const badDate = await annualExecutionGate(plan({ moduleData: { medical_treatment: { records: [{ visit_time: '2026-01-01' }] } } }), new Date('2027-05-01'), models());
  assert.equal(badDate.issue.role, 'familyDoctor');
  const future = await annualExecutionGate(plan(), new Date('2026-01-01'), models());
  assert.equal(future.issue, undefined);
});
