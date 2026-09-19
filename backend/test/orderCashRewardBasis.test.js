const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { conversionFor } = require('../src/utils/pointsHealthFund');
function harness() {
  const calls = []; const awarded = new Set();
  const mocks = {
    '../models/PointsLog': { findOne: async query => awarded.has(query.refId) ? { amount: 9000 } : null },
    './pointsHealthFund': { awardPointsAndConvert: async args => { calls.push(args); awarded.add(args.refId); } },
  };
  const ctx = { module: { exports: {} }, require: name => mocks[name] || {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/orderPoints'), 'utf8'), ctx);
  return { calls, award: ctx.module.exports.awardOrderPoints };
}
test('10000 price less 1000 fund earns points on 9000 actual cash, not price or a second deduction', async () => {
  const h = harness();
  await h.award({ _id: 'order', user: 'user', servicePrice: 10000, healthFundAmount: 1000, paidAmount: 9000, paymentStatus: 'paid' });
  assert.equal(h.calls[0].amount, 9000);
  assert.equal(conversionFor(0, h.calls[0].amount).fundAmount, 90);
});
test('coupon and health-fund deductions are already excluded from confirmed paidAmount', async () => {
  const h = harness();
  await h.award({ _id: 'order', user: 'user', servicePrice: 10000, healthFundAmount: 1000, couponDiscount: 500, paidAmount: 8500, paymentStatus: 'paid' });
  assert.equal(h.calls[0].amount, 8500);
});
test('zero-cash fully deducted orders do not earn consumption rewards', async () => {
  const h = harness();
  await h.award({ _id: 'order', servicePrice: 10000, healthFundAmount: 10000, paidAmount: 0, paymentStatus: 'paid' });
  assert.equal(h.calls.length, 0);
});
test('repeated award invocation for a settled order does not issue another reward', async () => {
  const h = harness(); const order = { _id: 'order', user: 'user', paidAmount: 9000, paymentStatus: 'paid' };
  await h.award(order); await h.award(order);
  assert.equal(h.calls.length, 1);
});
test('6799 cash points plus existing residual points can convert 68 fund without awarding 6800 new points', async () => {
  const h = harness();
  await h.award({ _id: 'order', user: 'user', servicePrice: 6800, healthFundAmount: 1, paidAmount: 6799, paymentStatus: 'paid' });
  assert.equal(h.calls[0].amount, 6799);
  assert.deepEqual(conversionFor(1, h.calls[0].amount, 0, 100), { pointsBalance: 0, redeemedPoints: 6800, fundAmount: 68 });
});
