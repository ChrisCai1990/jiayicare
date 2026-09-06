const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { needsCustomerServiceConfirmation, pendingServiceConfirmationQuery } = require('../src/utils/orderServiceConfirmation');

const base = {
  orderType: 'product', fulfillmentType: 'offline_service', paymentStatus: 'paid',
  tradeStatus: 'paid', status: 'pending', refundStatus: 'none',
  desiredServiceDate: null, serviceRequirements: '',
};

test('商城product只要是服务型履约就进入客户确认', () => {
  assert.equal(needsCustomerServiceConfirmation(base), true);
  assert.equal(needsCustomerServiceConfirmation({ ...base, fulfillmentType: 'remote_service' }), true);
});

test('实物、退款、完成和信息齐全订单不进入客户确认', () => {
  assert.equal(needsCustomerServiceConfirmation({ ...base, fulfillmentType: 'delivery_and_service' }), false);
  assert.equal(needsCustomerServiceConfirmation({ ...base, tradeStatus: 'refund_pending' }), false);
  assert.equal(needsCustomerServiceConfirmation({ ...base, refundStatus: 'requested' }), false);
  assert.equal(needsCustomerServiceConfirmation({ ...base, status: 'completed' }), false);
  assert.equal(needsCustomerServiceConfirmation({ ...base, desiredServiceDate: new Date(), serviceRequirements: '陪同检查' }), false);
});

test('待确认查询与页面资格使用同一服务型履约口径', () => {
  const query = pendingServiceConfirmationQuery('user-1');
  assert.deepEqual(query.fulfillmentType.$in, ['offline_service', 'remote_service']);
  assert.deepEqual(query.tradeStatus.$in, ['paid', 'fulfilling']);
  assert.deepEqual(query.refundStatus.$in, ['', 'none', null]);
});

test('待确认固定路由必须定义在动态订单ID路由之前', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/orders.js'), 'utf8');
  assert.ok(source.indexOf("router.get('/pending-service-confirmation'") < source.indexOf("router.get('/:id'"));
});
