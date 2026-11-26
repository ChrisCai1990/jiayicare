const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

test('staff history matches recipient and exact push IDs, including combined orders and refunds', async () => {
  const records = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(_id => ({ _id, patientId: { _id: 'patient' }, type: 'product' }));
  const orders = [
    { pushRecordId: 'a', paymentStatus: 'refunded' },
    { pushRecordId: 'a', pushRecordIds: ['a', 'b'], paymentStatus: 'paid' },
    { pushRecordId: 'c', tradeStatus: 'awaiting_payment' },
    { pushRecordId: 'd', tradeStatus: 'closed', paymentStatus: 'pending' },
    { pushRecordId: 'e', tradeStatus: 'refunded', status: 'cancelled' },
    { pushRecordId: 'f', tradeStatus: 'paid', refundStatus: 'processing' },
    { pushRecordId: 'g', refundStatus: 'partially_refunded' },
    { pushRecordId: 'h', paymentStatus: 'paid', user: 'other' },
  ].map(order => ({ user: 'patient', ...order }));
  const mocks = { '../models/Order': { find: () => ({ select: () => ({ lean: async () => orders }) }) },
    './combinableProductPushes': { orderPushFilter: () => ({}) } };
  const ctx = { module: { exports: {} }, require: id => mocks[id] };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/productPushOrderStatus'), 'utf8'), ctx);
  await ctx.module.exports.attachProductOrderStates(records);
  assert.deepEqual(records.map(r => r.orderState), ['paid', 'paid', 'pending', undefined, 'refunded', 'refunding', 'partialRefund', undefined]);
});
