const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const read = path => fs.readFileSync(require.resolve(`../src/${path}`), 'utf8');

test('cancelled cashier retries the same mall order and double tap cannot create two orders', async () => {
  const source = read('components/PurchaseModal.jsx');
  const start = source.indexOf('  const handleSubmit = async');
  const end = source.indexOf('\n  if (submitted)', start);
  let created = 0; let retried = 0; let success = false; const errors = [];
  const ctx = {
    isNativeApp: () => false, process: {env:{TARO_ENV:"weapp"}},
    selfMembership: false, beneficiaryUserId: '', pushRecordId: '', partnerCode: '', familyPayment: false, sharedApplied: 0, useSharedFund: false,
    submittingRef: { current: false }, pendingOrderRef: { current: null }, requiresServiceDetails: true,
    desiredServiceDate: '2026-09-30', serviceRequirements: '浙一', serviceAgreed: true,
    setSubmitting() {}, setErrMsg: error => errors.push(error), setSubmitted: value => { success = value; },
    isPay: true, finalPrice: 20000, currentPrice: 20000, currentSpecLabel: '', note: '',
    item: { id: 'product' }, fundApplied: 0, couponId: null, payMethod: 'wechat_pay', shareToken: '',
    checkoutUser: {}, setCheckoutUser() {}, updateUser() {},
    authAPI: { bindWechat: async () => ({ success: true, data: {} }) },
    servicesAPI: { order: async (...args) => { created++; assert.equal(args[9], 20000); return { success: true, data: { orderId: 'o', paymentParams: {} } }; } },
    paymentsAPI: { retry: async id => { retried++; assert.equal(id, 'o'); return { success: true, data: { order: { _id: 'o' }, paymentParams: {} } }; } },
    requestWechatPayment: async () => { throw new Error('取消支付'); }, waitForPayment: async () => {},
  };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.submit = handleSubmit;`, ctx);
  await Promise.all([ctx.submit(), ctx.submit()]); assert.equal(created, 1); assert.equal(success, false);
  ctx.requestWechatPayment = async () => {};
  await ctx.submit(); assert.equal(created, 1); assert.equal(retried, 1); assert.equal(success, true);
  ctx.finalPrice = 10000; await ctx.submit(); assert.equal(retried, 1); assert.match(errors.at(-1), /取消原订单/);
  const nativeActions = [];
  ctx.isNativeApp = () => true;
  ctx.finalPrice = 20000;
  ctx.pendingOrderRef.current = null;
  ctx.paymentsAPI.capabilities = async () => ({data:{app:true}});
  ctx.authAPI.bindWechat = () => assert.fail('native checkout must not bind a mini-program openid');
  ctx.callNative = async action => nativeActions.push(action);
  ctx.servicesAPI.order = async (...args) => {
    assert.equal(args.at(-1), true);
    return {success:true,data:{orderId:'app-order',paymentParams:{}}};
  };
  success = false;
  await ctx.submit();
  assert.deepEqual(nativeActions, ['prepare-payment','wechat-pay']);
  assert.equal(success, true);

});

test('opening notifications clears previous product detail; hiding clears stale overlays but preserves active cashier', async () => {
  const source = read('pages/messages/index.jsx');
  const state = { detail: { _id: 'old' }, shown: false };
  const ctx = { setDetailMsg: value => { state.detail = value; }, setShowNotif: value => { state.shown = value; },
    setNotifTab() {}, notificationsForTab: () => [], paymentActivityRef: { current: false },
    setPageVisible() {}, listRequestRef: { current: 0 }, listLoadingRef: { current: false },
    clearInterval() {}, listPollRef: { current: null }, useDidHide: callback => { ctx.hide = callback; } };
  let start = source.indexOf('  const openNotifications = async'); let end = source.indexOf('\n  const openConv', start);
  vm.runInNewContext(`${source.slice(start, end)}\nthis.open = openNotifications;`, ctx);
  await ctx.open('系统通知'); assert.equal(state.detail, null); assert.equal(state.shown, true);
  start = source.indexOf('  useDidHide('); end = source.indexOf('\n  useEffect', start);
  vm.runInNewContext(source.slice(start, end), ctx);
  state.detail = { _id: 'old' }; ctx.hide(); assert.equal(state.detail, null); assert.equal(state.shown, false);
  state.detail = { _id: 'paying' }; ctx.paymentActivityRef.current = true; ctx.hide(); assert.equal(state.detail._id, 'paying');
});
