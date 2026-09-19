const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function harness(config = {}) {
  const events = [];
  let locked = false;
  const save = async function () { return this; };
  const orders = ['a', 'b'].map((id, index) => ({ _id: id, checkoutGroupId: 'a', user: 'u', status: 'pending', paymentStatus: 'pending', tradeStatus: 'awaiting_payment', paymentExpectedAmount: index ? 318.44 : 6800, save }));
  const payments = [{ _id: 'original', outTradeNo: 'old', order: 'a', amount: 7118.44, user: 'u', status: config.paid ? 'succeeded' : 'processing', allocations: [{ order: 'a', amount: 6800 }, { order: 'b', amount: 318.44 }], save }];
  const mocks = {
    crypto: require('node:crypto'), './checkoutAmounts': require('../src/utils/checkoutAmounts'),
    '../models/Order': {
      findOneAndUpdate: async () => { if (locked) return null; locked = true; return orders[0]; },
      updateOne: async () => { locked = false; }, find: async () => orders,
      findById: async id => orders.find(o => o._id === id),
      updateMany: async (q, update) => orders.forEach(o => Object.assign(o, update.$set)),
    },
    '../models/Payment': { findOne: () => ({ sort: async () => payments[payments.length - 1] }),
      create: async data => { const p = { ...data, _id: 'new', save }; payments.push(p); return p; },
      updateOne: async (q, update) => Object.assign(payments.find(p => p._id === q._id), update.$set),
    },
    './wechatPay': {
      queryOrder: async () => { if (config.queryFail) throw new Error('network'); return { trade_state: config.remotePaid ? 'SUCCESS' : 'NOTPAY' }; },
      closeOrder: async () => { events.push(['close']); if (config.closeFail) throw new Error('network'); },
      createJsapiPayment: async options => { events.push(['gateway', options]); if (config.createFail) throw new Error('timeout'); return { prepayId: 'new-prepay', client: { package: 'prepay_id=new' } }; },
    },
    './orderSettlement': { confirmPayment: async () => { events.push(['settle']); orders.forEach(o => { o.paymentStatus = 'paid'; }); } },
    './orderInventory': { releaseOrderInventory: async o => events.push(['release', o._id]) },
  };
  const ctx = { module: { exports: {} }, require: name => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/groupPaymentActions'), 'utf8'), ctx);
  return { ...ctx.module.exports, orders, payments, events, user: { _id: 'u', wechatMpOpenid: 'openid' } };
}

test('retry from the second child closes old payment and charges the entire group exactly once', async () => {
  const h = harness(); const result = await h.retryGroupPayment(h.orders[1], h.user);
  assert.equal(result.checkoutAmount, 7118.44); assert.equal(result.orderIds.length, 2);
  assert.equal(h.events.find(e => e[0] === 'gateway')[1].amount, 7118.44);
  assert.equal(h.payments[0].status, 'closed'); assert.ok(h.orders.every(o => o.paymentId === 'new'));
});

test('concurrent retry only permits one replacement payment', async () => {
  const h = harness(); const results = await Promise.allSettled([h.retryGroupPayment(h.orders[0], h.user), h.retryGroupPayment(h.orders[1], h.user)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(h.events.filter(e => e[0] === 'gateway').length, 1);
});

test('uncertain query or close never opens a second payment or cancels stock', async () => {
  for (const config of [{ queryFail: true }, { closeFail: true }]) {
    for (const action of ['retryGroupPayment', 'cancelGroupPayment']) {
      const h = harness(config); await assert.rejects(h[action](h.orders[0], h.user));
      assert.equal(h.payments.length, 1); assert.ok(h.orders.every(o => o.tradeStatus === 'awaiting_payment'));
      assert.ok(!h.events.some(e => ['gateway', 'release'].includes(e[0])));
    }
  }
});

test('cancel from any child closes all pending siblings and releases each reservation', async () => {
  const h = harness(); await h.cancelGroupPayment(h.orders[1]);
  assert.ok(h.orders.every(o => o.tradeStatus === 'closed' && o.status === 'cancelled'));
  assert.deepEqual(h.events.filter(e => e[0] === 'release').map(e => e[1]), ['a', 'b']);
});

test('already paid remote group cannot be cancelled or charged again', async () => {
  const h = harness({ remotePaid: true }); await assert.rejects(h.cancelGroupPayment(h.orders[0]), /已确认支付/);
  assert.ok(!h.events.some(e => e[0] === 'close'));
  const retry = harness({ paid: true }); assert.equal((await retry.retryGroupPayment(retry.orders[1], retry.user)).alreadyPaid, true);
  assert.ok(!retry.events.some(e => e[0] === 'gateway'));
});

test('retry gateway timeout retains new group payment for recovery, not a failed orphan', async () => {
  const h = harness({ createFail: true }); await assert.rejects(h.retryGroupPayment(h.orders[1], h.user));
  assert.equal(h.payments[1].status, 'processing'); assert.ok(h.orders.every(o => o.paymentId === 'new'));
});

test('shipping report waits for all items and carries every physical package', () => {
  const { groupShippingPayload } = require('../src/utils/wechatOrderShipping');
  const orders = [{ _id: 'a', serviceName: 'A', fulfillmentType: 'delivery_and_service' }, { _id: 'b', serviceName: 'B', fulfillmentType: 'delivery_and_service' }];
  const first = { order: 'a', status: 'shipped', trackingNo: 't1', deliveryCompany: 'SF' };
  assert.equal(groupShippingPayload(orders, [first]), null);
  const result = groupShippingPayload(orders, [first, { order: 'b', status: 'shipped', trackingNo: 't2', deliveryCompany: 'SF' }]);
  assert.equal(result.delivery_mode, 2); assert.equal(result.shipping_list.length, 2); assert.equal(result.is_all_delivered, true);
});
