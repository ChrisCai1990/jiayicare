const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(options = {}) {
  const events = []; let locked = false; let handler;
  const order = { _id: 'o', user: 'u', paymentStatus: 'pending', tradeStatus: 'awaiting_payment', paymentExpectedAmount: 20000, save: async () => {} };
  const payments = [{ _id: 'p', order: 'o', amount: 20000, outTradeNo: 'old', status: 'processing', prepayId: 'old', save: async () => {} }];
  const pay = { queryOrder: async () => {
    if (options.queryFail) throw new Error('offline');
    return { trade_state: payments.length > 1 ? 'NOTPAY' : (options.remote || 'NOTPAY') };
  }, closeOrder: async () => events.push('close'), buildClientParams: id => ({ package: id }),
  createJsapiPayment: async input => { events.push(['create', input.amount]); if (options.createFail) throw new Error('timeout'); return { prepayId: 'next', client: { package: 'next' } }; } };
  pay.assertAppReady = () => { if (options.appDisabled) throw Error('disabled'); };
  pay.createAppPayment = async input => { events.push(['app', input.amount]); return { prepayId: 'native', client: { appId: 'wx1111111111111111', prepayId: 'native' } }; };
  pay.buildAppClientParams = id => ({ appId: 'wx1111111111111111', prepayId: id });
  if (options.nativeExisting) Object.assign(payments[0], { tradeType: 'APP', appId: 'wx1111111111111111', createdAt: new Date() });
  const mocks = {
    express: { Router: () => ({ get() {}, post: (path, ...handlers) => { if (path === '/:orderId/retry') handler = handlers.at(-1); } }) },
    '../middleware/auth': {}, '../models/Order': { findOne: async () => order, findById: async () => order },
    '../models/Payment': { findOne: () => ({ sort: async () => payments.at(-1) }), create: async data => {
      const p = { ...data, _id: 'next', createdAt: new Date(), save: async () => {} }; payments.push(p); return p;
    } }, '../models/Refund': {}, '../utils/wechatPay': pay,
    '../utils/orderSettlement': { confirmPayment: async () => { order.paymentStatus = 'paid'; return order; } },
    '../utils/checkoutAmounts': require('../src/utils/checkoutAmounts'),
    '../utils/groupPaymentActions': { withGroupLock: async (_, work) => {
      if (locked) throw new Error('locked'); locked = true; try { return await work(); } finally { locked = false; }
    } },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/routes/payments'), 'utf8'), { module: { exports: {} }, require: name => {
    if (!(name in mocks)) throw new Error(name); return mocks[name];
  }, console, process: { env: { WECHAT_APP_APPID: 'wx1111111111111111' } } });
  return { events, payments, order, run: async () => {
    let result; const res = { status: () => res, json: data => { result = data; return res; } };
    await handler({ body: options.native ? { paymentScene: 'app' } : {}, params: { orderId: 'o' }, user: { _id: 'u', wechatMpOpenid: options.native ? undefined : 'current' } }, res); return result;
  } };
}
test('retry replaces a closed WeChat payment without trying to close it again', async () => {
  const h = harness({ remote: 'CLOSED' }); assert.equal((await h.run()).success, true);
  assert.deepEqual(h.events, [['create', 20000]]);
});
test('repeat retry reuses the current payer prepay; concurrent requests cannot close each other', async () => {
  const h = harness(); const results = await Promise.all([h.run(), h.run()]);
  assert.equal(results.filter(r => r.success).length, 1);
  assert.equal((await h.run()).data.paymentParams.package, 'next');
  assert.equal(h.payments.length, 2); assert.equal(h.events.filter(e => e === 'close').length, 1);
});
test('unconfirmed remote status and in-progress payment never create a second charge', async () => {
  for (const options of [{ queryFail: true }, { remote: 'USERPAYING' }]) {
    const h = harness(options); assert.equal((await h.run()).success, false); assert.equal(h.payments.length, 1);
  }
});
test('paid remote order is recovered; timeout keeps newest attempt queryable', async () => {
  const paid = harness({ remote: 'SUCCESS' }); assert.equal((await paid.run()).data.alreadyPaid, true); assert.equal(paid.payments.length, 1);
  const timeout = harness({ createFail: true }); assert.equal((await timeout.run()).success, false); assert.equal(timeout.payments.at(-1).status, 'processing');
});
test('catalogue price is authoritative even when an old SKU has half the price', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/services'), 'utf8');
  const start = source.indexOf('    const prices = product.servicePrices');
  const end = source.indexOf('\n  // 会员专享', start);
  for (const servicePrices of [[], [{ label: '到店', price: 20000 }]]) {
    const ctx = { product: { _id: 'p', name: '全专联合会诊', originalPrice: 20000, servicePrices, skus: [{ label: '到店', price: 10000 }] }, specificationLabel: undefined };
    vm.runInNewContext(`this.result = (() => { let service; if (true) {${source.slice(start, end)}\nreturn service; })();`, ctx);
    assert.equal(ctx.result.price, 20000);
  }
});

test('a mismatched confirmed amount is rejected before order creation', () => {
  const source = fs.readFileSync(require.resolve('../src/routes/services'), 'utf8');
  const start = source.indexOf('  const paidAmount =');
  const end = source.indexOf('  // 真实服务统一', start);
  for (const expectedAmount of [10000, 20000, 'invalid']) {
    const ctx = { priceAfterCoupon: 20000, fundUsed: 0, req: { body: { expectedAmount } },
      res: { status(code) { assert.equal(code, 409); return this; }, json: body => body } };
    vm.runInNewContext(`this.result = (() => { ${source.slice(start, end)} return 'accepted'; })();`, ctx);
    assert.equal(expectedAmount === 20000 ? ctx.result : ctx.result.code, expectedAmount === 20000 ? 'accepted' : 'CHECKOUT_QUOTE_CHANGED');
  }
});


test('APP retry has no mini payer dependency and closes JSAPI prepay before creating APP', async () => {
  const h = harness({ native: true }); assert.equal((await h.run()).success, true);
  assert.deepEqual(h.events, ['close', ['app', 20000]]);
  assert.equal(h.payments.at(-1).tradeType, 'APP');
});
test('APP same-scene retry reuses matching prepay, disabled channel never mutates payment', async () => {
  const h = harness({ native: true, nativeExisting: true }); assert.equal((await h.run()).data.paymentParams.prepayId, 'old');
  assert.equal(h.events.length, 0);
  const disabled = harness({ native: true, appDisabled: true }); assert.equal((await disabled.run()).success, false); assert.equal(disabled.events.length, 0);
});
test('mini retry cannot reuse APP prepay parameters', async () => {
  const h = harness({ nativeExisting: true }); assert.equal((await h.run()).success, true);
  assert.deepEqual(h.events, ['close', ['create', 20000]]);
});
