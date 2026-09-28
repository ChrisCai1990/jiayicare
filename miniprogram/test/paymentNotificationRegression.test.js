const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require.resolve(`../src/${path}`), 'utf8');

test('cancelled cashier retries the same mall order and double tap cannot create two orders', async () => {
  const source = read('pages/services/mall/index.jsx');
  const start = source.indexOf('  const handleSubmit = async');
  const end = source.indexOf('\n  if (submitted)', start);
  let created = 0; let retried = 0; let success = false; const errors = [];
  const ctx = {
    submittingRef: { current: false }, pendingOrderRef: { current: null }, requiresServiceDetails: true,
    desiredServiceDate: '2026-09-30', serviceRequirements: '浙一', serviceAgreed: true,
    setSubmitting() {}, setErrMsg: error => errors.push(error), setSubmitted: value => { success = value; },
    isPay: true, finalPrice: 20000, currentPrice: 20000, currentSpecLabel: '', note: '',
    item: { id: 'product' }, fundApplied: 0, couponId: null, payMethod: 'wechat_pay', shareToken: '',
    checkoutUser: {}, setCheckoutUser() {}, updateUser() {},
    authAPI: { bindWechat: async () => ({ success: true, data: {} }) },
    servicesAPI: { order: async (...args) => { created++; assert.equal(args.at(-1), 20000); return { success: true, data: { orderId: 'o', paymentParams: {} } }; } },
    paymentsAPI: { retry: async id => { retried++; assert.equal(id, 'o'); return { success: true, data: { order: { _id: 'o' }, paymentParams: {} } }; } },
    requestWechatPayment: async () => { throw new Error('取消支付'); }, waitForPayment: async () => {},
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.submit = handleSubmit;`, ctx);
  await Promise.all([ctx.submit(), ctx.submit()]); assert.equal(created, 1); assert.equal(success, false);
  ctx.requestWechatPayment = async () => {};
  await ctx.submit(); assert.equal(created, 1); assert.equal(retried, 1); assert.equal(success, true);
  ctx.finalPrice = 10000; await ctx.submit(); assert.equal(retried, 1); assert.match(errors.at(-1), /取消原订单/);
});

test('opening notifications clears previous product detail; hiding clears stale overlays but preserves active cashier', async () => {
  const source = read('pages/messages/index.jsx');
  const state = { detail: { _id: 'old' }, shown: false };
  const ctx = { setDetailMsg: value => { state.detail = value; }, setShowNotif: value => { state.shown = value; },
    setNotifTab() {}, notificationsForTab: () => [], paymentActivityRef: { current: false },
    clearInterval() {}, listPollRef: { current: null }, useDidHide: callback => { ctx.hide = callback; } };
  let start = source.indexOf('  const openNotifications = async'); let end = source.indexOf('\n  const openConv', start);
  vm.runInNewContext(`${source.slice(start, end)}\nthis.open = openNotifications;`, ctx);
  await ctx.open('系统通知'); assert.equal(state.detail, null); assert.equal(state.shown, true);
  start = source.indexOf('  useDidHide('); end = source.indexOf('\n  useEffect', start);
  vm.runInNewContext(source.slice(start, end), ctx);
  state.detail = { _id: 'old' }; ctx.hide(); assert.equal(state.detail, null); assert.equal(state.shown, false);
  state.detail = { _id: 'paying' }; ctx.paymentActivityRef.current = true; ctx.hide(); assert.equal(state.detail._id, 'paying');
});
