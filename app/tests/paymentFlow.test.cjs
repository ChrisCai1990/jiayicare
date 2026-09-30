const test = require('node:test');
const assert = require('node:assert/strict');
const { finishCheckout } = require('../src/utils/paymentFlow');
const { canCancelOrder, tradeLabel } = require('../src/utils/orderPaymentStatus');
const result = { success: true, data: { orderId: 'synthetic', paymentParams: {} } };
const status = (paymentStatus, checkoutPaid = true) => ({ success: true, data: { order: { paymentStatus }, checkoutPaid } });
const noWait = async () => {};
test('SDK success alone cannot mark pending order or partial group paid', async () => {
  for (const response of [status('pending'), status('paid', false)]) {
    await assert.rejects(finishCheckout(result, async () => {}, async () => response, noWait), /待确认/);
  }
});
test('lost or cancelled SDK callback can recover confirmed server payment', async () => {
  const order = await finishCheckout(result, async () => { throw Error('cancel'); }, async () => status('paid'), noWait);
  assert.equal(order.paymentStatus, 'paid');
});
test('cancelled unpaid checkout stays unpaid and can be retried from order', async () => {
  await assert.rejects(finishCheckout(result, async () => { throw Error('cancel'); }, async () => status('pending'), noWait), /继续支付/);
});
test('server errors, missing params, refunded order never produce a success', async () => {
  await assert.rejects(finishCheckout({ success: false }, () => {}, () => {}));
  await assert.rejects(finishCheckout({ success: true, data: { orderId: 'x' } }, () => {}, () => {}), /未取得/);
  await assert.rejects(finishCheckout(result, () => {}, async () => status('refunded'), noWait), /退款/);
});
test('fully deducted order still verifies server without invoking SDK', async () => {
  const order = await finishCheckout({ success: true, data: { orderId: 'x', paymentStatus: 'paid' } }, () => assert.fail(), async () => status('paid'), noWait);
  assert.equal(order.paymentStatus, 'paid');
});
test('trade state labels and cancellation honor paid/refund states', () => {
  for (const tradeStatus of ['paid','fulfilling','completed','refunded','refund_pending']) {
    assert.ok(tradeLabel({ tradeStatus })); assert.equal(canCancelOrder({ tradeStatus, status: 'pending' }), false);
  }
  assert.equal(canCancelOrder({ tradeStatus: 'awaiting_payment', status: 'pending', paymentStatus: 'pending' }), true);
});
