const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

for (const reviewEnabled of [false, true]) test('login layout with review enabled = ' + reviewEnabled, async () => {
  let index = 0;
  const state = [];
  const React = {createElement: (type, props, ...children) => ({type, props, children}), useState: initial => {
    const key = index++;
    return [state[key] ?? initial, value => { state[key] = value; }];
  }, useEffect: effect => effect()};
  const Taro = {useLoad() {}, useShareAppMessage() {}};
  const mocks = {
    react: React, '@tarojs/taro': Taro, '@tarojs/components': { View: 'View', Text: 'Text', Input: 'Input', Button: 'Button' },
    '../../../theme': { colors: {}, spacing: {}, radius: {} }, '../../../services/api': {authAPI:{reviewStatus:async()=>({data:{enabled:reviewEnabled}})}},
    '../../../context/AuthContext': { useAuth: () => ({ login() {} }) }, '../../../components/Icon': 'Icon',
    '../../../utils/invitation': {}, '../../../i18n': {useLanguage: () => ({t: s => s})}, '../../../utils/accountDeletionReceipt': {loadDeletionReceipt: () => null},
  };
  const code = babel.transformSync(read('pages/auth/login/index.jsx'), { configFile: false, babelrc: false,
    presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const ctx = { exports: {}, require: name => mocks[name] };
  vm.runInNewContext(code, ctx);
  ctx.exports.default();
  await Promise.resolve();
  index = 0;
  const tree = ctx.exports.default();
  const elements = [];
  function visit(node) { if (!node || typeof node !== 'object') return; elements.push(node); (node.children || []).flat(Infinity).forEach(visit); }
  visit(tree);
  const labels = elements.flatMap(node => node.children.filter(child => typeof child === 'string').map(child => child.trim()));
  for (const label of ['10,000+', '服务用户', '300+', '签约医生', '99%', '满意度']) assert.ok(labels.includes(label), label);
  assert.ok(!labels.includes('暂不登录，先浏览'));
  assert.equal(labels.filter(label => label === '我已阅读并同意').length, 1);
  assert.equal(labels.includes('进入审核体验'), reviewEnabled);
  if (reviewEnabled) {
    assert.ok(labels.indexOf('我已阅读并同意') < labels.indexOf('进入审核体验'));
    assert.ok(labels.indexOf('进入审核体验') < labels.indexOf('手机号登录'));
  }
  assert.ok(labels.indexOf('立即登录') > labels.indexOf('我已阅读并同意'));
});

function checkout(result, overrides = {}) {
  const source = read('pages/messages/index.jsx');
  const start = source.indexOf('  const handlePay = async', source.indexOf('function ProductPushDetail'));
  const end = source.indexOf('\n  if (paid)', start);
  const events = [];
  const ctx = { checkedIds: ['product-1'], msg: { _id: 'push-1' }, familyPayment: false, fundApplied: 0, useSharedFund: false, couponId: null, payMethod: 'wechat',
    payingRef: { current: false }, paymentActivityRef: { current: false }, pendingOrderId: '', finalPrice: 6800, setCheckoutQuote: value => events.push(['quote', value]), setPendingOrderId: () => {},
    setPaying: value => events.push(['paying', value]), setPayError: value => events.push(['error', value]), setPaid: value => events.push(['paid', value]),
    pushRecordsAPI: { pay: async (id, params) => { events.push(['create', params.paymentCapability, params.beneficiaryUserId]); return result; } },
    requestWechatPayment: async () => { events.push(['cashier']); }, waitForPayment: async () => { events.push(['confirmed']); }, ...overrides };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.pay = handlePay;`, ctx);
  return { events, run: () => ctx.pay() };
}

test('pushed product opens cashier and waits for server confirmation before success', async () => {
  const h = checkout({ success: true, data: { orderId: 'order-1', paymentParams: { package: 'prepay_id=1', paySign: 'signed' } } });
  await h.run();
  assert.deepEqual(h.events.filter(row => ['create', 'cashier', 'confirmed', 'paid'].includes(row[0])),
    [['create', 'wechat_jsapi_v1', ''], ['cashier'], ['confirmed'], ['paid', true]]);
});

test('family push uses the same cashier while keeping the beneficiary on the order request', async () => {
  const h = checkout({ success: true, data: { orderId: 'family-order', paymentParams: { package: 'prepay_id=2' } } },
    { msg: { _id: 'family-push', beneficiaryUserId: 'family-member' }, familyPayment: true });
  await h.run();
  assert.deepEqual(h.events.filter(row => ['create', 'cashier', 'confirmed', 'paid'].includes(row[0])),
    [['create', 'wechat_jsapi_v1', 'family-member'], ['cashier'], ['confirmed'], ['paid', true]]);
});

test('cancelled payment and delayed server confirmation never display paid', async () => {
  for (const overrides of [
    { requestWechatPayment: async () => { throw new Error('您已取消支付'); } },
    { waitForPayment: async () => { throw new Error('付款结果正在确认'); } },
  ]) {
    const h = checkout({ success: true, data: { orderId: 'order-1', paymentParams: {} } }, overrides);
    await h.run(); assert.ok(!h.events.some(row => row[0] === 'paid')); assert.ok(h.events.some(row => row[0] === 'error' && row[1]));
  }
});

test('missing payment parameters are not success; server-confirmed fund-only payment is', async () => {
  const bad = checkout({ success: true, data: { orderId: 'order-1', paymentStatus: 'pending' } });
  await bad.run(); assert.ok(!bad.events.some(row => row[0] === 'paid'));
  const fund = checkout({ success: true, data: { orderId: 'order-1', paymentStatus: 'paid' } });
  await fund.run(); assert.ok(fund.events.some(row => row[0] === 'paid')); assert.ok(!fund.events.some(row => row[0] === 'cashier'));
});

test('shared cashier helper rejects incomplete parameters and reports user cancellation', async () => {
  const ctx = { Taro: { requestPayment: () => Promise.reject({ errMsg: 'requestPayment:fail cancel' }) }, paymentsAPI: {} };
  vm.runInNewContext(read('utils/wechatPay.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await assert.rejects(ctx.requestWechatPayment({}), /信息不完整/);
  await assert.rejects(ctx.requestWechatPayment({ package: 'prepay_id=1', paySign: 'signed' }), /取消支付/);
});

test('two products are independently selectable, including deselect-all/select-all', () => {
  const source = read('pages/messages/index.jsx');
  const component = source.slice(source.indexOf('function ProductPushDetail'), source.indexOf('\nconst ROLE_META'));
  let cursor = 0;
  const states = [];
  const refs = [];
  let refCursor = 0;
  const ctx = {
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    useState: init => { const index = cursor++; if (!(index in states)) states[index] = typeof init === 'function' ? init() : init; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: value => { const index = refCursor++; if (!refs[index]) refs[index] = { current: value }; return refs[index]; },
    useEffect() {}, useAuth: () => ({ user: {}, updateUser() {} }), maxSingleFundDeduction: () => 0, maxGroupFundDeduction: () => 0,
    colors: {}, spacing: {}, radius: {}, View: 'View', Text: 'Text', ScrollView: 'ScrollView', Icon: 'Icon', RENEWAL_PAYMENT_METHODS: [{ key: 'wechat', label: '微信支付' }],
  };
  const code = babel.transformSync(component, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')] }).code;
  vm.runInNewContext(`${code}\nthis.render = ProductPushDetail;`, ctx);
  function elements() {
    cursor = 0; refCursor = 0;
    const tree = ctx.render({ msg: { products: [{ productId: 'a', name: 'A', price: 6800 }, { productId: 'b', name: 'B', price: 318.44 }] }, onClose() {} });
    const nodes = []; function visit(node) { if (!node || typeof node !== 'object') return; nodes.push(node); (node.children || []).flat(Infinity).forEach(visit); } visit(tree); return nodes;
  }
  assert.deepEqual(Array.from((elements(), states[0])), ['a', 'b']);
  elements().find(n => n.props.key === 'b').props.onClick(); assert.deepEqual(Array.from(states[0]), ['a']);
  elements().find(n => n.props.key === 'b').props.onClick(); assert.deepEqual(Array.from(states[0]), ['a', 'b']);
  elements().find(n => n.type === 'Text' && n.children.includes('取消全选')).props.onClick(); assert.equal(states[0].length, 0);
  elements().find(n => n.type === 'Text' && n.children.includes('全选')).props.onClick(); assert.equal(states[0].length, 2);
  const nodes = elements();
  const body = nodes.find(n => n.type === 'ScrollView' && n.props.scrollY);
  const descendants = [];
  function visit(node) { if (!node || typeof node !== 'object') return; descendants.push(node); (node.children || []).flat(Infinity).forEach(visit); }
  visit(body);
  assert.ok(descendants.some(n => n.type === 'Text' && n.children.includes('抵用券')));
  assert.ok(descendants.some(n => n.type === 'Text' && String(n.children[0]).startsWith('合计 ¥')));
  assert.ok(!descendants.some(n => n.type === 'Text' && String(n.children[0]).startsWith('微信支付 ¥')));
  assert.ok(nodes.some(n => n.type === 'Text' && String(n.children[0]).startsWith('微信支付 ¥')));
});

test('changed checkout quote does not call the cashier before a second confirmation', async () => {
  const h = checkout({ success: false, code: 'CHECKOUT_QUOTE_CHANGED', message: '请确认新报价', summary: { finalPrice: 7118.44 } });
  await h.run(); assert.ok(h.events.some(e => e[0] === 'quote')); assert.ok(!h.events.some(e => e[0] === 'cashier' || e[0] === 'paid'));
});

test('double tap starts one checkout; pending group is viewed rather than created again', async () => {
  const h = checkout({ success: true, data: { orderId: 'a', paymentParams: {} } });
  await Promise.all([h.run(), h.run()]); assert.equal(h.events.filter(e => e[0] === 'create').length, 1);
  let navigated = false;
  const pending = checkout({}, { pendingOrderId: 'a', Taro: { navigateTo: () => { navigated = true; } } });
  await pending.run(); assert.equal(navigated, true); assert.equal(pending.events.filter(e => e[0] === 'create').length, 0);
});

test('cashier confirmation does not succeed when only the first child has settled', async () => {
  const ctx = { Taro: {}, paymentsAPI: { status: async () => ({ data: { order: { paymentStatus: 'paid' }, checkoutPaid: false } }) } };
  vm.runInNewContext(read('utils/wechatPay.js').replace(/^import .*;\r?\n/gm, '').replace(/export /g, ''), ctx);
  await assert.rejects(ctx.waitForPayment('a', 1), /正在确认/);
});
