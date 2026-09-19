const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateManualOrderPayment: validate } = require('../src/utils/manualOrderPayment');
const orderBase = { _id: 'o1', user: 'u1', serviceName: '产品', servicePrice: 10000, healthFundAmount: 1000, couponDiscount: 0, paymentStatus: 'unpaid', status: 'pending' };

test('manual receipt explicitly accepts net cash without treating deductions as cash', () => {
  assert.deepEqual(validate(orderBase, 'onsite', '9000'), { amount: 9000 });
  assert.ok(validate(orderBase, 'onsite', 10000).error);
  assert.deepEqual(validate({ ...orderBase, couponDiscount: 500 }, 'onsite', 8500), { amount: 8500 });
  assert.deepEqual(validate({ ...orderBase, servicePrice: 100.01, healthFundAmount: 0.01 }, 'onsite', 100), { amount: 100 });
});
test('missing, nonnumeric, negative, excessive precision and invalid deduction values are rejected', () => {
  for (const amount of [undefined, null, '', ' ', -1, '-1', true, [], {}, NaN, Infinity, '1.001']) {
    assert.ok(validate(orderBase, 'onsite', amount).error, String(amount));
  }
  assert.ok(validate({ ...orderBase, healthFundAmount: 10001 }, 'healthFund', 0).error);
  assert.ok(validate(orderBase, 'onsite', 0).error);
});
test('full fund deduction has zero cash reward basis; mixed payment is not fund-only', () => {
  assert.deepEqual(validate({ ...orderBase, healthFundAmount: 10000 }, 'healthFund', 0), { amount: 0 });
  assert.ok(validate(orderBase, 'healthFund', 9000).error);
  assert.ok(validate(orderBase, 'healthFund', 0).error);
});

function route(orderFields = {}) {
  const source = fs.readFileSync(require.resolve('../src/routes/admin'), 'utf8');
  const start = source.indexOf("router.patch('/orders/:id/pay'");
  const end = source.indexOf('// ── PATCH /api/admin/orders/:id/refund', start);
  const calls = [];
  const order = { ...orderBase, ...orderFields, save: async () => calls.push(['save']) };
  let handler;
  vm.runInNewContext(source.slice(start, end), { router: { patch: (_path, _auth, h) => { handler = h; } }, adminAuth() {},
    Order: { findById: async () => order }, crypto: { randomBytes: () => ({ toString: () => 'abcdef12' }) },
    require: name => ({
      '../utils/manualOrderPayment': { validateManualOrderPayment: validate },
      '../utils/orderSupplementArchive': { ensureOrderSupplementDraft: async () => {} },
      '../utils/orderPoints': { awardOrderPoints: async row => calls.push(['reward', row.paidAmount]) },
    })[name],
  });
  return { calls, order, async run(body) {
    let status = 200, response;
    await handler({ params: { id: 'o1' }, body, admin: { _id: 'admin' } }, { status(code) { status = code; return this; }, json(value) { response = value; } });
    return { status, response };
  } };
}
test('admin route persists explicit 9000 actual receipt and uses shared reward path', async () => {
  const h = route();
  assert.equal((await h.run({ paymentMethod: 'onsite', paidAmount: 9000 })).status, 200);
  assert.equal(h.order.paidAmount, 9000);
  assert.deepEqual(h.calls, [['save'], ['reward', 9000]]);
  assert.equal((await h.run({ paymentMethod: 'onsite', paidAmount: 9000 })).status, 400);
  assert.equal(h.calls.length, 2);
});
test('old clients posting catalogue price or missing receipt cannot change payment state', async () => {
  for (const body of [{ paymentMethod: 'onsite' }, { paymentMethod: 'onsite', paidAmount: 10000 }]) {
    const h = route(); assert.equal((await h.run(body)).status, 400);
    assert.equal(h.order.paymentStatus, 'unpaid'); assert.equal(h.calls.length, 0);
  }
});
test('WeChat, cancelled and refund orders cannot be manually confirmed', async () => {
  for (const fields of [{ paymentId: 'payment' }, { paymentMethod: 'wechat' }, { status: 'cancelled' }, { tradeStatus: 'refunded' }]) {
    const h = route(fields); assert.equal((await h.run({ paymentMethod: 'onsite', paidAmount: 9000 })).status, 409);
    assert.equal(h.calls.length, 0);
  }
});
test('admin form sends the typed amount and keeps validation errors inside its modal', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../admin/src/pages/OrdersPage.jsx'), 'utf8');
  const start = source.indexOf('  const confirmPay = async');
  const end = source.indexOf('  const handleRefund =', start);
  const calls = [];
  const ctx = { payModalOrder: orderBase, payMethod: 'onsite', cashReceived: '9000', page: 1,
    setPayError: error => calls.push(['error', error]), setUpdating() {}, setPayModalOrder() {}, load: async () => {}, toast() {},
    adminAPI: { payOrder: async (...args) => { calls.push(args); return { message: 'ok' }; } } };
  vm.runInNewContext(source.slice(start, end) + '\nthis.pay = confirmPay;', ctx);
  await ctx.pay(); assert.ok(calls.some(row => row[0] === 'o1' && row[2] === 9000));
  calls.length = 0; ctx.cashReceived = ''; await ctx.pay();
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'error');
  assert.match(source, /role="alert"/);
  assert.match(source, /setCashReceived\(''\)/);
  assert.doesNotMatch(source, /payOrder\(payModalOrder\._id, payMethod, payModalOrder\.servicePrice\)/);
});
