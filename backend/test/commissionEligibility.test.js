const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibility, adjustedAmount } = require('../src/utils/commissionEligibility');
const referral = { role: 'referrer' };
const paidAt = new Date('2026-09-01T02:00:00Z');
const order = { paidAt, status: 'scheduled', fulfillmentStatus: 'booked' };
test('referral requires both real start and seven full days, not booking or assignment', () => {
  const boundary = new Date('2026-09-08T02:00:00Z');
  assert.equal(eligibility(order, referral, boundary).ready, false);
  assert.equal(eligibility({ ...order, serviceStartedAt: paidAt }, referral, new Date(boundary - 1)).ready, false);
  assert.equal(eligibility({ ...order, serviceStartedAt: paidAt }, referral, boundary).ready, true);
  assert.equal(eligibility({ ...order, paidAt: null, serviceStartedAt: paidAt }, referral, boundary).ready, false);
  assert.equal(eligibility({ ...order, fulfillmentStatus: 'shipped' }, referral, boundary).ready, false);
});
test('completed service and real redemption establish start; service performance requires corresponding redemption', () => {
  const now = new Date('2026-09-10T00:00:00Z');
  assert.equal(eligibility({ ...order, status: 'completed' }, referral, now).ready, true);
  const redeemed = { ...order, redemptions: [{ sequence: 1, redeemedAt: paidAt }] };
  assert.equal(eligibility(redeemed, referral, now).ready, true);
  assert.equal(eligibility(redeemed, { role: 'fulfiller', redemptionSequence: 1 }, now).ready, true);
  assert.equal(eligibility(redeemed, { role: 'fulfiller', redemptionSequence: 2 }, now).ready, false);
  assert.equal(eligibility(order, { role: 'fulfiller' }, now).ready, false);
});
test('partial refund uses original snapshot without repeated percentage reductions', () => {
  const row = { originalOrderAmount: 359, originalCommissionAmount: 71.8, commissionRate: 0.2 };
  const once = adjustedAmount(row, 0.5);
  assert.equal(once.commissionAmount, 35.9);
  assert.deepEqual(adjustedAmount({ ...row, ...once }, 0.5), once);
  assert.equal(adjustedAmount({ ...row, commissionRate: 0, originalCommissionAmount: 200 }, 0.5).commissionAmount, 179.5);
});

test('maturity reconciliation promotes eligible estimates, holds refunds, and resets approval after partial refund', async () => {
  const fs = require('node:fs'); const vm = require('node:vm'); const path = require('node:path');
  let row = { _id: 'commission', status: 'estimated', role: 'referrer', orderAmount: 100, commissionAmount: 20, commissionRate: 0.2 };
  let refunds = [];
  const Commission = { find: async () => [row], updateOne: async (filter, update) => Object.assign(row, update.$set) };
  const Refund = { find: () => ({ select: async () => refunds }) };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/utils/commissionMaturity.js'), 'utf8'), {
    module, require: name => name.includes('Eligibility') ? { eligibility, adjustedAmount } : name.includes('Lifecycle') ? { cancellationReason: () => '', cancelOrderCommissions() {} } : name.includes('Commission') ? Commission : Refund,
  });
  const o = { _id: 'order', paidAt: new Date('2020-01-01'), paymentStatus: 'paid', paidAmount: 100, serviceStartedAt: new Date('2020-01-02') };
  await module.exports.refreshOrderCommissions(o);
  assert.equal(row.status, 'pending');
  row.status = 'confirmed'; refunds = [{ status: 'succeeded', amount: 50 }];
  await module.exports.refreshOrderCommissions(o);
  assert.equal(row.commissionAmount, 10); assert.equal(row.status, 'pending');
  await module.exports.refreshOrderCommissions(o); assert.equal(row.commissionAmount, 10);
  refunds.push({ status: 'processing', amount: 20 });
  await module.exports.refreshOrderCommissions(o); assert.equal(row.status, 'estimated');
});
