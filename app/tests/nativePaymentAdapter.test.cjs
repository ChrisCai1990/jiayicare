const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { transformSync } = require('esbuild');
function adapter(options = {}) {
  const events = [];
  const sdk = { registerApp: async args => { events.push(['register', args]); return { success: options.registered !== false }; }, isWechatInstalled: async () => ({ success: options.installed !== false }),
    requestPayment: async () => { events.push(['sdk']); return { errorCode: 0 }; } };
  const paymentsAPI = { capabilities: async () => ({ data: { app: options.serverReady !== false } }), status: async () => ({ success: true, data: { order: { paymentStatus: 'paid' } } }) };
  const env = { EXPO_PUBLIC_WECHAT_APP_PAY_ENABLED: 'true', EXPO_PUBLIC_WECHAT_APP_APPID: 'wx1111111111111111', EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK: 'https://test.invalid/wechat/', ...options.env };
  const context = { module: { exports: {} }, process: { env }, setTimeout, clearTimeout,
    require: name => {
      if (name === 'react-native') return { Platform: { OS: options.os || 'android' } };
      if (name === '../services/api') return { paymentsAPI };
      if (name === './paymentFlow') return require('../src/utils/paymentFlow');
      if (name === 'expo-native-wechat') { events.push(['load']); return sdk; }
      throw Error(name);
    } };
  vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/utils/nativePayment.native'), 'utf8'), { loader: 'js', format: 'cjs' }).code, context);
  return { api: context.module.exports, events };
}
test('missing configuration or disabled server prevents SDK registration and checkout preparation', async () => {
  for (const options of [{ env: { EXPO_PUBLIC_WECHAT_APP_PAY_ENABLED: '' } }, { serverReady: false }, { os: 'ios', env: { EXPO_PUBLIC_WECHAT_UNIVERSAL_LINK: '' } }]) {
    const h = adapter(options); await assert.rejects(h.api.prepareNativePayment()); assert.equal(h.events.length, 0);
  }
});
test('native adapter registers once, rejects missing WeChat, and invokes SDK for matching appid', async () => {
  const failed = adapter({ registered: false }); await assert.rejects(failed.api.prepareNativePayment(), /初始化失败/);
  const missing = adapter({ installed: false }); await assert.rejects(missing.api.prepareNativePayment(), /安装微信/);
  const h = adapter(); await h.api.prepareNativePayment(); await h.api.prepareNativePayment();
  assert.equal(h.events.filter(e => e[0] === 'register').length, 1);
  await h.api.completeNativePayment({ success: true, data: { orderId: 'test', paymentParams: { appId: 'wx1111111111111111', package: 'Sign=WXPay' } } });
  assert.equal(h.events.filter(e => e[0] === 'sdk').length, 1);
});
test('mismatched appid never reaches native SDK', async () => {
  const h = adapter(); await h.api.prepareNativePayment();
  // The order may independently be paid; status recovery is allowed, SDK use is not.
  await h.api.completeNativePayment({ success: true, data: { orderId: 'test', paymentParams: { appId: 'wrong', package: 'Sign=WXPay' } } });
  assert.equal(h.events.filter(e => e[0] === 'sdk').length, 0);
});
test('native login module loads when window exists without browser location', () => {
  const theme = { colors: {}, spacing: {}, radius: {}, shadow: {} };
  const context = { module: { exports: {} }, process: { env: {} }, window: {},
    require: name => {
      if (name === 'react-native') return { Platform: { OS: 'android' }, Dimensions: { get: () => ({ height: 800 }) }, StyleSheet: { create: a => a } };
      if (name === '../../theme') return theme;
      return {};
    } };
  vm.runInNewContext(transformSync(fs.readFileSync(require.resolve('../src/screens/auth/LoginScreen'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, context);
  assert.equal(typeof context.module.exports.default, 'function');
});
