const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const read = file => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

test('login cancel is available without consent or phone and returns to public home', async () => {
  const actions = [];
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: init => [typeof init === 'function' ? init() : init, () => {}] };
  const Taro = { useLoad() {}, useShareAppMessage() {}, removeStorageSync: key => actions.push(['remove', key]),
    switchTab: options => { actions.push(['home', options.url]); return Promise.resolve(); } };
  const mocks = {
    react: React, '@tarojs/taro': Taro, '@tarojs/components': { View: 'View', Text: 'Text', Input: 'Input', Button: 'Button' },
    '../../../theme': { colors: {}, spacing: {}, radius: {} }, '../../../services/api': {},
    '../../../context/AuthContext': { useAuth: () => ({ login() {} }) }, '../../../components/Icon': 'Icon',
    '../../../utils/invitation': {},
  };
  const code = babel.transformSync(read('pages/auth/login/index.jsx'), { configFile: false, babelrc: false,
    presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const ctx = { exports: {}, require: name => mocks[name] };
  vm.runInNewContext(code, ctx);
  const tree = ctx.exports.default();
  const elements = [];
  function visit(node) { if (!node || typeof node !== 'object') return; elements.push(node); (node.children || []).flat(Infinity).forEach(visit); }
  visit(tree);
  const cancel = elements.find(node => node.type === 'Button' && node.children.includes('暂不登录，先浏览'));
  assert.ok(cancel); assert.ok(!cancel.props.disabled);
  cancel.props.onClick(); await Promise.resolve();
  assert.deepEqual(actions, [['remove', 'jy_post_login_url'], ['home', '/pages/home/index']]);
});

function checkout(result, overrides = {}) {
  const source = read('pages/messages/index.jsx');
  const start = source.indexOf('  const handlePay = async', source.indexOf('function ProductPushDetail'));
  const end = source.indexOf('\n  if (paid)', start);
  const events = [];
  const ctx = { checkedIds: ['product-1'], msg: { _id: 'push-1' }, fundApplied: 0, couponId: null, payMethod: 'wechat',
    payingRef: { current: false }, pendingOrderId: '', finalPrice: 6800, setCheckoutQuote: value => events.push(['quote', value]), setPendingOrderId: () => {},
    setPaying: value => events.push(['paying', value]), setPayError: value => events.push(['error', value]), setPaid: value => events.push(['paid', value]),
    pushRecordsAPI: { pay: async (id, params) => { events.push(['create', params.paymentCapability]); return result; } },
    requestWechatPayment: async () => { events.push(['cashier']); }, waitForPayment: async () => { events.push(['confirmed']); }, ...overrides };
  vm.runInNewContext(`${source.slice(start, end)}\nthis.pay = handlePay;`, ctx);
  return { events, run: () => ctx.pay() };
}

test('pushed product opens cashier and waits for server confirmation before success', async () => {
  const h = checkout({ success: true, data: { orderId: 'order-1', paymentParams: { package: 'prepay_id=1', paySign: 'signed' } } });
  await h.run();
  assert.deepEqual(h.events.filter(row => ['create', 'cashier', 'confirmed', 'paid'].includes(row[0])),
    [['create', 'wechat_jsapi_v1'], ['cashier'], ['confirmed'], ['paid', true]]);
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
    useEffect() {}, useAuth: () => ({ user: {}, updateUser() {} }), maxFundDeduction: () => 0,
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
