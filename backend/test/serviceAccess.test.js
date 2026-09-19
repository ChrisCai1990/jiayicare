const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveServiceAccess, legacyAccess } = require('../src/utils/serviceAccess');
const user = { _id: 'patient', serviceExpiry: '2026-12-31' };
const period = patch => ({ startDate: '2027-01-01', endDate: '2027-12-31', sourceType: 'offline_contract', confirmedBy: 'planner', contractReference: 'C2027', evidenceSnapshot: { verifiedByPlanner: true }, legacyServiceWindow: { serviceExpiry: '2026-12-31' }, ...patch });
const models = (periods, order) => ({ Period: { find: q => { assert.equal(q.patientId, 'patient'); return { sort: () => ({ lean: async () => periods }) }; } }, Order: { findById: () => ({ lean: async () => order }) } });
test('历史客户兼容旧有效期，统一按北京时间至当天结束', async () => {
  assert.equal((await resolveServiceAccess(user, new Date('2026-12-31T15:59:59Z'), models([]))).active, true);
  assert.equal((await resolveServiceAccess(user, new Date('2026-12-31T16:00:00Z'), models([]))).active, false);
  assert.equal(legacyAccess({}).active, true);
  assert.equal(legacyAccess({ serviceStartDate: '2099-01-01' }).active, false);
});
test('可信续约覆盖旧到期档案，但不依赖年度方案是否已确认', async () => {
  const access = await resolveServiceAccess(user, new Date('2027-02-01'), models([period()]));
  assert.equal(access.active, true); assert.equal(access.source, 'verified_renewal'); assert.equal(access.endDate, '2027-12-31');
  assert.equal(user.serviceExpiry, '2026-12-31');
});
test('未来续约不提前启用，旧期在有效范围内仍可用', async () => {
  const future = period({ startDate: '2027-02-01', endDate: '2028-01-31' });
  assert.equal((await resolveServiceAccess(user, new Date('2026-12-15'), models([future]))).active, true);
  const gap = await resolveServiceAccess(user, new Date('2027-01-15'), models([future]));
  assert.equal(gap.active, false); assert.equal(gap.nextStartDate, '2027-02-01');
});
test('核验时冻结旧期，后续编辑档案不能填平合同空档', async () => {
  const modified = { ...user, serviceExpiry: '2099-12-31' };
  assert.equal((await resolveServiceAccess(modified, new Date('2027-01-15'), models([period({ startDate: '2027-02-01' })]))).active, false);
  assert.equal((await resolveServiceAccess(modified, new Date('2028-01-15'), models([period()]))).active, false);
});
test('两个可信服务期之间的空档不能回退到档案未来日期', async () => {
  const rows = [period(), period({ startDate: '2028-03-01', endDate: '2029-02-28' })];
  assert.equal((await resolveServiceAccess({ ...user, serviceExpiry: '2099-12-31' }, new Date('2028-02-01'), models(rows))).active, false);
});
test('支付订单每次核验，退款及他人订单不能恢复服务', async () => {
  const paid = { user: 'patient', orderType: 'package', paymentStatus: 'paid', annualServiceSnapshot: { durationMonths: 12 } };
  const row = period({ sourceType: 'paid_order', sourceOrderId: 'order' });
  assert.equal((await resolveServiceAccess(user, new Date('2027-02-01'), models([row], paid))).active, true);
  for (const patch of [{ refundStatus: 'approved' }, { tradeStatus: 'refunded' }, { user: 'other' }, { paymentStatus: 'pending' }]) assert.equal((await resolveServiceAccess({ ...user, serviceExpiry: '2099-12-31' }, new Date('2027-02-01'), models([row], { ...paid, ...patch }))).active, false);
});
test('合同缺核验记录、非法日期或删除档案不放行', async () => {
  for (const patch of [{ confirmedBy: null }, { evidenceSnapshot: {} }, { endDate: '2027-02-30' }]) assert.equal((await resolveServiceAccess(user, new Date('2027-02-01'), models([period(patch)]))).active, false);
  assert.equal((await resolveServiceAccess({ ...user, isDeleted: true })).active, false);
});
