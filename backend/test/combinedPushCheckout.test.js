const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const sameBatch of [true,false]) test(sameBatch ? 'two bottles in one recommendation make one order' : 'independent recommendations retain attribution', async () => {
  let sequence = 0;
  const orders = [], payments = [], claims = [], reservations = [];
  const makeId = () => `id${++sequence}`;
  const records = ['first', 'second'].map(id => ({ _id: id, patientId: 'patient', staffId: sameBatch ? 'staff' : `staff-${id}`, recommendationBatchId: sameBatch ? 'batch' : null,
    products: [{ productId: 'product', name: '维生素D', price: 359.67, specificationLabel: '2000IU*90粒' }] }));
  const product = { _id: 'product', name: '维生素D', status: 'on', category: '营养',
    fulfillmentType:'delivery_and_service', paymentChannel: 'wechat_pay', servicePrices: [{ label: '2000IU*90粒', price: 359.67 }] };
  const mocks = {
    mongoose: { Types: { ObjectId: class { constructor() { this.value = makeId(); } toString() { return this.value; } } } },
    '../models/Order': { findOne: async () => null, create: async row => { orders.push(row); return row; }, updateMany: async () => {}, updateOne: async () => {} },
    '../models/Product': { findOne: async () => product, updateOne: async () => {} },
    '../models/Payment': { create: async row => { const payment = { ...row, _id: 'payment', save: async () => {} }; payments.push(payment); return payment; }, updateOne: async () => {} },
    '../models/Coupon': { findOne: async () => null },
    '../models/PushRecord': { findOneAndUpdate: async query => { claims.push(String(query._id)); return records.find(row => row._id === query._id); }, updateOne: async () => {} },
    './healthFundPayment': { getHealthFundPolicy: async () => ({}) },
    './checkoutAmounts': require('../src/utils/checkoutAmounts'),
    './orderInventory': { reserveProduct: async () => { reservations.push('product'); return { available: true, reserved: false }; }, releaseOrderInventory: async () => {} },
    './serviceOwnership': { resolveOrderWorkflowAssignee: async () => 'planner', orderOwnershipFields: () => ({ supervisorId: 'planner' }) },
    './productBusinessAllocations': { snapshot: () => [] },
    './productPerformanceSnapshot': { snapshot: () => ({ performanceRule: null, servicePerformerRoles: [], staffPerformanceOverrides: [] }) },
    './wechatPay': { createJsapiPayment: async () => ({ prepayId: 'prepay', client: { package: 'prepay_id=prepay' } }) },
    './combinableProductPushes': { singleItem: row => row.products[0], orderPushFilter: ids => ({pushRecordId:{$in:ids}}) },
  };
  const context = { module: { exports: {} }, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Date, Number, String, Set, Map, Math, BigInt };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/pushGroupCheckout'), 'utf8'), context);
  const result = await context.module.exports.createCombinedPushCheckout({ records,
    user: { _id: 'patient', wechatMpOpenid: 'openid' }, options: { paymentMethod: 'wechat', expectedAmount: 719.34 } });
  assert.equal(result.success, true);
  assert.deepEqual(claims, ['first', 'second']);
  if (sameBatch) {
    assert.equal(orders.length, 1);
    assert.equal(orders[0].quantity, 2);
    assert.equal(orders[0].servicePrice, 719.34);
    assert.deepEqual(Array.from(orders[0].pushRecordIds), ['first','second']);
    assert.equal(payments[0].allocations.length, 1);
    assert.equal(payments[0].allocations[0].amount, 719.34);
    return;
  }
  assert.deepEqual(reservations, ['product', 'product']);
  assert.equal(orders.length, 2);
  assert.deepEqual(orders.map(row => row.pushRecordId), ['first', 'second']);
  assert.deepEqual(orders.map(row => row.referrerId), ['staff-first', 'staff-second']);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].amount, 719.34);
  assert.equal(payments[0].allocations.length, 2);
});
