const test = require('node:test');
const assert = require('node:assert/strict');
const { isShippingOrder, hasShippingHandoff, shippingProgress } = require('../../shared/orderShipping.cjs');

test('legacy confirmed product appears as awaiting shipment, specialised services stay separate', () => {
  const order = { serviceName: '营养改变生活', status: 'scheduled', supervisorId: 'planner', note: '已确认服务任务：寄到家里' };
  assert.match(shippingProgress(order), /待健管专员发货/);
  assert.equal(shippingProgress({ ...order, supervisorId: null }), '');
  assert.equal(shippingProgress({ ...order, status: 'pending' }), '');
  assert.match(shippingProgress({ ...order, fulfillmentStatus: 'shipped' }), /已发货/);
  assert.equal(isShippingOrder({ ...order, serviceWorkflowSnapshot: { key: 'nutrition_intervention' } }), true);
  assert.equal(hasShippingHandoff({ ...order, note: '客户想寄到家里' }), false);
  assert.equal(isShippingOrder({ serviceName: '专家约诊' }), false);
});

test('shipment HTTP: role, owner, cancelled order, validation, list and duplicate protection', async t => {
  const express = require('express');
  const Order = require('../src/models/Order'), User = require('../src/models/User'), Fulfillment = require('../src/models/Fulfillment');
  const original = [Order.find, Order.findOne, Order.updateOne, User.find, Fulfillment.find, Fulfillment.findOneAndUpdate];
  const order = { _id: 'order', user: 'patient', serviceName: '营养改变生活', status: 'scheduled', supervisorId: 'planner', note: '已确认服务任务：寄到家里' };
  let permitted = true, shipped = false, updates = 0;
  User.find = filter => { assert.deepEqual(filter, { assignedHealthManager: 'manager' }); return { distinct: async () => ['patient'] }; };
  function checkScope(filter) {
    assert.deepEqual(filter.user, { $in: ['patient'] });
    assert.equal(filter.status, 'scheduled');
    assert.equal(filter.handledBy, undefined);
    assert.ok(!filter.tradeStatus.$in.includes('refunded'));
    assert.ok(!filter.refundStatus.$in.includes('processing'));
  }
  Order.find = filter => { checkScope(filter); return { populate: () => ({ sort: () => ({ lean: async () => [order] }) }) }; };
  Order.findOne = async filter => { checkScope(filter); return permitted ? order : null; };
  Order.updateOne = async (filter, update) => { checkScope(filter); assert.equal(update.$set.fulfillmentStatus, 'shipped'); updates++; };
  Fulfillment.find = () => ({ distinct: async () => shipped ? ['order'] : [] });
  Fulfillment.findOneAndUpdate = async (filter, update) => {
    if (update.$setOnInsert) return { _id: 'fulfillment', status: shipped ? 'shipped' : 'awaiting_shipment' };
    assert.equal(filter.status, 'awaiting_shipment');
    if (shipped) return null;
    shipped = true; return { _id: 'fulfillment', ...update.$set };
  };
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.staff = { _id: 'manager', role: req.headers['x-role'] || 'healthManager' }; next(); });
  app.use(require('../src/routes/orderShipments'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    [Order.find, Order.findOne, Order.updateOne, User.find, Fulfillment.find, Fulfillment.findOneAndUpdate] = original;
  });
  const call = async (body, role) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/${body ? 'order' : ''}`, {
    method: body ? 'PATCH' : 'GET', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-role': role } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  }); return { status: r.status, body: await r.json() }; };
  assert.equal((await call(null, 'healthPlanner')).status, 403);
  assert.equal((await call()).body.data.length, 1);
  assert.equal((await call({})).status, 400);
  const shipping = { deliveryCompany: '测试快递', trackingNo: 'TEST123' };
  permitted = false; assert.equal((await call(shipping)).status, 409);
  permitted = true; assert.equal((await call(shipping)).status, 200);
  assert.equal((await call(shipping)).status, 409);
  assert.equal(updates, 1);
  assert.equal((await call()).body.data.length, 0);
});
