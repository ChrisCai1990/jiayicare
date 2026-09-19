const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness() {
  const events = [], awarded = new Set(), prompts = new Set(), refunds = [];
  const orders = [
    { _id: 'a', user: 'user', checkoutGroupId: 'a', paymentExpectedAmount: 8900, healthFundAmount: 1000, couponId: 'coupon', serviceName: 'A' },
    { _id: 'b', user: 'user', checkoutGroupId: 'a', paymentExpectedAmount: 100, healthFundAmount: 0, couponId: 'coupon', serviceName: 'B' },
  ].map(o => ({ ...o, paymentStatus: 'pending', save: async function () { events.push(['save', this._id, this.paymentStatus]); return this; } }));
  const payment = { _id: 'pay', order: 'a', user: 'user', amount: 9000, channel: 'wechat_pay', status: 'processing', allocations: [{ order: 'a', amount: 8900 }, { order: 'b', amount: 100 }] };
  const coupon = { status: 'active' };
  let failFundOnce = false;
  const mocks = {
    '../models/Order': { findById: async id => orders.find(o => o._id === id), findOne: async q => orders.find(o => o._id !== q._id.$ne && o.refundStatus !== 'refunded') },
    '../models/Payment': {
      findOne: async () => payment,
      findOneAndUpdate: async (query, update) => {
        if (query.outTradeNo) { if (payment.status === 'succeeded') return null; Object.assign(payment, update.$set); return payment; }
        if (payment.settlementLockToken) return null;
        Object.assign(payment, update.$set); return payment;
      },
      updateOne: async (query, update) => { if (query.settlementLockToken === payment.settlementLockToken) Object.assign(payment, update.$set); },
    },
    '../models/User': { findById: async () => ({ _id: 'user' }) },
    '../models/Coupon': {
      findOneAndUpdate: async (q, update) => { if (coupon.status !== 'active') return null; Object.assign(coupon, update); return coupon; },
      findOne: async q => coupon.status === q.status && coupon.usedOrderId === q.usedOrderId ? coupon : null,
      updateOne: async (q, update) => { if (coupon.status === q.status && coupon.usedOrderId === q.usedOrderId) { Object.assign(coupon, update); events.push(['couponRestored']); } },
    },
    '../models/Fulfillment': { findOneAndUpdate: async q => ({ _id: `f-${q.order}`, status: 'awaiting_shipment' }), updateOne: async () => {} },
    '../models/FollowUp': { findOneAndUpdate: async () => ({}), updateMany: async () => {} },
    '../models/Refund': {
      findOneAndUpdate: async (q, update) => { const refund = refunds.find(r => r._id === q._id); if (refund.status === 'succeeded') return null; Object.assign(refund, update.$set); return refund; },
      findById: async id => refunds.find(r => r._id === id),
      aggregate: async query => [{ amount: refunds.filter(r => r.order === query[0].$match.order && r.status === 'succeeded').reduce((s, r) => s + r.amount, 0) }],
    },
    './orderPoints': { awardOrderPoints: async o => { if (!awarded.has(o._id)) { awarded.add(o._id); events.push(['award', o._id, o.paidAmount]); } }, refundOrderPoints: async o => events.push(['reversePoints', o._id]) },
    './healthPlannerAssignment': { resolveHealthPlanner: async () => 'planner' },
    './checkoutAmounts': require('../src/utils/checkoutAmounts'),
    './healthFundPayment': { deductHealthFund: async ({ order }) => { if (failFundOnce) { failFundOnce = false; throw new Error('fund temporary'); } events.push(['fund', order._id]); }, reverseHealthFund: async ({ order }) => events.push(['reverseFund', order._id]) },
    './medicalReminderWorkflow': { isMedicalReminderOrder: () => false },
    './orderPlannerConversation': { isMedicationProxyOrder: () => false, ensureOrderPlannerPrompt: async o => prompts.add(o._id) },
    './orderSupplementArchive': { ensureOrderSupplementDraft: async () => {} },
    './commissionSettlement': { settleReferralCommission: async () => {} },
    './commissionLifecycle': { cancelOrderCommissions: async () => {} },
    './productShareRewards': { grantProductShareRewards: async () => {}, reverseProductShareRewards: async () => {} },
    crypto: require('node:crypto'),
  };
  const ctx = { module: { exports: {} }, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/orderSettlement'), 'utf8'), ctx);
  return { ...ctx.module.exports, orders, payment, events, prompts, coupon, refunds, failFund: () => { failFundOnce = true; },
    pay: () => ctx.module.exports.confirmPayment({ outTradeNo: 'merchant', transactionId: 'wx-id' }) };
}

test('one successful WeChat payment settles every child at its own cash amount and emits independent followups', async () => {
  const h = harness(); await h.pay(); await h.pay();
  assert.deepEqual(h.orders.map(o => o.paidAmount), [8900, 100]);
  assert.ok(h.orders.every(o => o.paymentStatus === 'paid' && o.paymentId === 'pay'));
  assert.equal(h.events.filter(e => e[0] === 'fund').length, 1);
  assert.equal(h.events.filter(e => e[0] === 'award').length, 2);
  assert.equal(h.prompts.size, 2); assert.equal(h.coupon.usedOrderId, 'a');
});

test('concurrent callbacks serialize group settlement and never double-deduct or double-award', async () => {
  const h = harness(); const results = await Promise.allSettled([h.pay(), h.pay()]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  await h.pay(); assert.equal(h.events.filter(e => e[0] === 'award').length, 2); assert.equal(h.events.filter(e => e[0] === 'fund').length, 1);
});

test('failed post-payment side effect keeps cash fact and is recoverable without charging again', async () => {
  const h = harness(); h.failFund(); await assert.rejects(h.pay(), /fund temporary/);
  assert.equal(h.orders[0].paymentStatus, 'paid'); assert.equal(h.orders[1].paymentStatus, 'pending');
  assert.equal(h.payment.settlementLockToken, '');
  await h.pay(); assert.ok(h.orders.every(o => o.paymentStatus === 'paid')); assert.equal(h.events.filter(e => e[0] === 'award').length, 2);
});

test('refund of one child preserves siblings and shared coupon; all refunded returns coupon, late payment cannot resurrect', async () => {
  const h = harness(); await h.pay();
  const first = { _id: 'r1', order: 'b', status: 'requested', amount: 100 }; h.refunds.push(first);
  await h.confirmRefund(first); assert.equal(h.orders[1].paymentStatus, 'refunded'); assert.equal(h.orders[0].paymentStatus, 'paid'); assert.equal(h.coupon.status, 'used');
  await h.pay(); assert.equal(h.orders[1].paymentStatus, 'refunded');
  const second = { _id: 'r2', order: 'a', status: 'requested', amount: 8900 }; h.refunds.push(second);
  await h.confirmRefund(second); await h.confirmRefund(second);
  assert.equal(h.coupon.status, 'active'); assert.equal(h.events.filter(e => e[0] === 'couponRestored').length, 1);
  await h.pay(); assert.ok(h.orders.every(o => o.paymentStatus === 'refunded'));
});

test('tampered cash allocation is rejected before marking any child paid', async () => {
  const h = harness(); h.payment.allocations[1].amount = 101;
  await assert.rejects(h.pay(), /分摊金额/); assert.ok(h.orders.every(o => o.paymentStatus === 'pending'));
});

test('ordinary historical payment still settles as one order', async () => {
  const h = harness(); h.payment.allocations = [];
  await h.pay(); assert.equal(h.orders[0].paidAmount, 9000); assert.equal(h.orders[1].paymentStatus, 'pending');
});
