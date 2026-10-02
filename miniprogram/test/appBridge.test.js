const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('native bridge resolves only the matching response and rejects SDK failures', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/appBridge.js'), 'utf8');
  const { callNative, isNativeApp } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const previousWindow = global.window;
  const previousEnv = process.env.TARO_ENV;
  const handlers = new Set();
  let posted;
  process.env.TARO_ENV = 'h5';
  global.window = {
    __JIAYICARE_NATIVE_BRIDGE__: 'v1',
    ReactNativeWebView: { postMessage: value => { posted = JSON.parse(value); } },
    addEventListener: (_, handler) => handlers.add(handler),
    removeEventListener: (_, handler) => handlers.delete(handler),
  };
  try {
    assert.equal(isNativeApp(), true);
    const first = callNative('prepare-payment');
    for (const handler of handlers) handler({ detail: { requestId: 'wrong', ok: true } });
    assert.equal(handlers.size, 1);
    for (const handler of handlers) handler({ detail: { requestId: posted.requestId, ok: true } });
    await first;
    assert.equal(handlers.size, 0);

    const second = callNative('wechat-pay', { params: { package: 'Sign=WXPay' } });
    for (const handler of handlers) handler({ detail: { requestId: posted.requestId, ok: false, message: '微信付款未确认' } });
    await assert.rejects(second, /微信付款未确认/);
    assert.equal(handlers.size, 0);
  } finally {
    global.window = previousWindow;
    if (previousEnv === undefined) delete process.env.TARO_ENV;
    else process.env.TARO_ENV = previousEnv;
  }
});
