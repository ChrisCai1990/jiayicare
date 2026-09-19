const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const mongoose = require('mongoose');
const { cents, splitCents, paymentAllocations } = require('../src/utils/checkoutAmounts');
const actualFund = require('../src/utils/healthFundPayment');

function harness(config = {}) {
  const events = [], orders = [], payments = [];
  const items = [{ productId: 'a', name: '营养改变生活', price: 6800 }, { productId: 'b', name: '维生素D', price: 318.44 }];
  const products = items.map(item => ({ _id: item.productId, status: 'on', paymentChannel: 'wechat_pay', fulfillmentType: 'delivery_and_service', category: '营养', ...(config.products?.[item.productId] || {}) }));
  const user = { _id: 'u', wechatMpOpenid: 'openid' };
  const record = { _id: 'push', staffId: 'doctor', servicePerformers: [{ productId: 'a', role: 'nutritionist', staffId: 'n1' }, { productId: 'b', role: 'nutritionist', staffId: 'n2' }] };
  const save = async function () { return this; };
  const mocks = {
    mongoose,
    '../models/Order': { findOne: async () => config.pending || null, create: async doc => { const order = { ...doc, save }; orders.push(order); return order; }, updateMany: async () => {}, updateOne: async () => {} },
    '../models/Product': { findOne: async q => config.offline === q._id ? null : products.find(p => p._id === q._id), updateOne: async q => events.push(['unreserve', String(q._id)]) },
    '../models/Payment': { create: async doc => { const payment = { ...doc, _id: 'payment', save }; payments.push(payment); return payment; }, updateOne: async (q, u) => Object.assign(payments[0], u.$set) },
    '../models/Coupon': { findOne: async () => config.coupon || null },
    '../models/PushRecord': { findOneAndUpdate: async () => config.locked ? null : record, updateOne: async () => {} },
    '../models/Enterprise': { findById: async () => null },
    './healthFundPayment': { ...actualFund, getHealthFundPolicy: async () => ({ ...actualFund.DEFAULT_HEALTH_FUND_POLICY, ...(config.policy || {}) }), getPersonalFundAvailable: async () => config.personal || 0, getCorporateFundAvailable: async () => config.corporate || 0 },
    './checkoutAmounts': require('../src/utils/checkoutAmounts'),
    './orderInventory': { reserveProduct: async p => { events.push(['reserve', p._id]); return { reserved: config.soldOut !== p._id, available: config.soldOut !== p._id }; }, releaseOrderInventory: async o => events.push(['release', o.serviceId]) },
    './serviceOwnership': { resolveOrderWorkflowAssignee: async () => 'planner', orderOwnershipFields: () => ({ supervisorId: 'planner' }) },
    './wechatPay': { createJsapiPayment: async args => { events.push(['gateway', args]); if (config.gatewayError) throw new Error('timeout'); return { prepayId: 'prepay', client: { package: 'prepay_id=prepay', paySign: 'sig' } }; } },
    './orderSettlement': { confirmPayment: async () => { events.push(['settlement']); if (config.settlementError) throw new Error('temporary failure'); } },
  };
  const ctx = { module: { exports: {} }, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/pushGroupCheckout'), 'utf8'), ctx);
  return { ...ctx.module.exports, events, orders, payments, items, products, user, record,
    run: options => ctx.module.exports.createPushGroupCheckout({ record, user, items, options: { paymentMethod: 'wechat', ...(options || {}) } }) };
}

test('largest-remainder cents allocation conserves money, including one-cent and large values', () => {
  for (const capacities of [[680000, 31844], [1, 1, 1], [0, 11, 0], [900000000, 100000001]]) {
    const total = capacities.reduce((s, v) => s + v, 0);
    for (const amount of [0, 1, Math.floor(total / 3), total]) {
      const parts = splitCents(amount, capacities);
      assert.equal(parts.reduce((s, v) => s + v, 0), amount);
      parts.forEach((part, index) => assert.ok(Number.isInteger(part) && part >= 0 && part <= capacities[index]));
    }
  }
  assert.throws(() => splitCents(4, [1, 2]));
  assert.throws(() => cents(NaN));
});

test('two items create two independent owned orders and one WeChat charge for 7118.44', async () => {
  const h = harness(); const result = await h.run({ expectedAmount: 7118.44 });
  assert.equal(result.success, true); assert.equal(h.orders.length, 2); assert.equal(h.payments.length, 1);
  assert.equal(h.events.filter(e => e[0] === 'gateway').length, 1);
  assert.equal(h.payments[0].amount, 7118.44); assert.equal(h.payments[0].allocations.length, 2);
  assert.deepEqual(h.orders.map(o => o.paidAmount), [0, 0]);
  assert.deepEqual(h.orders.map(o => o.paymentExpectedAmount), [6800, 318.44]);
  assert.deepEqual(h.orders.map(o => o.servicePerformers[0].staffId), ['n1', 'n2']);
  assert.ok(h.orders.every(o => String(o.checkoutGroupId) === String(h.orders[0]._id) && o.supervisorId === 'planner'));
  assert.equal(paymentAllocations(h.payments[0]).length, 2);
});

test('coupon and fund are allocated per item; cash sums to the single gateway charge', async () => {
  const h = harness({ personal: 1000, coupon: { _id: 'coupon', type: 'amount', value: 100 } });
  await h.run({ couponId: 'coupon', useHealthFund: 1000, expectedAmount: 6018.44 });
  assert.equal(h.payments[0].amount, 6018.44);
  for (const o of h.orders) assert.equal(cents(o.servicePrice), cents(o.couponDiscount) + cents(o.healthFundAmount) + cents(o.paymentExpectedAmount));
  assert.equal(h.orders.reduce((s, o) => s + cents(o.healthFundAmount), 0), 100000);
  assert.equal(h.orders.reduce((s, o) => s + cents(o.couponDiscount), 0), 10000);
});

test('corporate fund does not flow into an ineligible product, personal fund remains usable', async () => {
  const h = harness({ personal: 1, corporate: 100, products: { b: { healthFundDeduction: { mode: 'disabled' } } } });
  const q = await h.quoteGroup(h.user, h.items, h.products, { useHealthFund: 68 });
  assert.equal(q.allocations[1].corporate, 0);
  assert.ok(q.allocations[1].personal > 0);
  assert.equal(q.summary.fundUsed, 68);
});

test('quote mismatch creates no order and asks user to confirm revised amount', async () => {
  const h = harness(); const result = await h.run({ useHealthFund: 68, expectedAmount: 7050.44 });
  assert.equal(result.code, 'CHECKOUT_QUOTE_CHANGED'); assert.equal(h.orders.length, 0); assert.equal(h.events.length, 0);
});

test('second product unavailable, missing payment channel and concurrent checkout are rejected before charging', async () => {
  for (const cfg of [{ offline: 'b' }, { products: { b: { paymentChannel: 'offline' } } }, { locked: true }, { pending: { _id: 'old' } }]) {
    const h = harness(cfg); await assert.rejects(h.run()); assert.equal(h.orders.length, 0); assert.ok(!h.events.some(e => e[0] === 'gateway'));
  }
});

test('second reservation failure closes first order and releases its stock, with no payment', async () => {
  const h = harness({ soldOut: 'b' }); await assert.rejects(h.run());
  assert.equal(h.orders[0].tradeStatus, 'closed'); assert.ok(h.events.some(e => e[0] === 'release' && e[1] === 'a')); assert.equal(h.payments.length, 0);
});

test('gateway timeout preserves both orders and reservations for status/retry, never falsely marks paid', async () => {
  const h = harness({ gatewayError: true }); await assert.rejects(h.run(), /待确认/);
  assert.ok(h.orders.every(o => o.paymentStatus === 'pending'));
  assert.equal(h.payments[0].status, 'processing'); assert.ok(!h.events.some(e => e[0] === 'release'));
});

test('fully funded group uses common settlement without calling WeChat; temporary settlement failure preserves recovery', async () => {
  const h = harness({ personal: 7118.44 }); const result = await h.run({ useHealthFund: 7118.44 });
  assert.equal(result.data.paymentStatus, 'paid'); assert.equal(h.payments[0].amount, 0); assert.ok(!h.events.some(e => e[0] === 'gateway'));
  const failed = harness({ personal: 7118.44, settlementError: true }); await assert.rejects(failed.run({ useHealthFund: 7118.44 }));
  assert.ok(!failed.events.some(e => e[0] === 'release')); assert.ok(failed.orders.every(o => o.tradeStatus !== 'closed'));
});
