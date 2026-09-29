const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
function gateway(overrides = {}) {
  const env = { WECHAT_APP_PAY_ENABLED: 'true', WECHAT_APP_APPID: 'wx1111111111111111',
    WECHAT_MP_APPID: 'wx2222222222222222', WECHAT_PAY_MCH_ID: 'testmerchant',
    WECHAT_PAY_SERIAL_NO: 'testserial', WECHAT_PAY_API_V3_KEY: '0'.repeat(32),
    WECHAT_PAY_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    WECHAT_PAY_NOTIFY_URL: 'https://test.invalid/notify', ...overrides };
  const requests = [];
  const https = { request(options, respond) {
    const req = new EventEmitter(); let body = '';
    req.write = chunk => { body += chunk; };
    req.end = () => { requests.push({ options, body: JSON.parse(body) });
      const res = new EventEmitter(); res.statusCode = 200; respond(res);
      res.emit('data', JSON.stringify({ prepay_id: 'synthetic-prepay' })); res.emit('end'); };
    return req;
  } };
  const context = { module: { exports: {} }, Buffer, process: { env }, require: name => ({ crypto, https, fs })[name] };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/wechatPay'), 'utf8'), context);
  return { api: context.module.exports, requests };
}
test('APP gateway uses mobile appid, exact cents, no mini-program openid and verifiable RSA signature', async () => {
  const h = gateway();
  const result = await h.api.createAppPayment({ description: 'Synthetic service', outTradeNo: 'test-order', amount: 20000 });
  assert.equal(h.requests[0].options.path, '/v3/pay/transactions/app');
  assert.equal(h.requests[0].body.appid, 'wx1111111111111111');
  assert.equal(h.requests[0].body.amount.total, 2000000);
  assert.equal(h.requests[0].body.payer, undefined);
  const p = result.client;
  assert.equal(p.package, 'Sign=WXPay');
  assert.ok(crypto.verify('RSA-SHA256', Buffer.from(`${p.appId}\n${p.timeStamp}\n${p.nonceStr}\n${p.prepayId}\n`), publicKey, Buffer.from(p.sign, 'base64')));
  assert.equal(crypto.verify('RSA-SHA256', Buffer.from(`${p.appId}\n${p.timeStamp}\n${p.nonceStr}\nprepay_id=${p.prepayId}\n`), publicKey, Buffer.from(p.sign, 'base64')), false);
});
test('unconfigured or disabled APP and invalid amounts never contact gateway', async () => {
  for (const env of [{ WECHAT_APP_PAY_ENABLED: '' }, { WECHAT_APP_APPID: '' }, { WECHAT_APP_APPID: 'wx2222222222222222' }]) {
    const h = gateway(env); await assert.rejects(h.api.createAppPayment({ amount: 1 })); assert.equal(h.requests.length, 0);
  }
  for (const amount of [NaN, -1, 0, Infinity]) { const h = gateway(); await assert.rejects(h.api.createAppPayment({ amount })); assert.equal(h.requests.length, 0); }
});
test('released JSAPI still requires the mini-program payer and uses its separate appid/signature', async () => {
  const h = gateway({ WECHAT_APP_PAY_ENABLED: '' });
  await assert.rejects(h.api.createJsapiPayment({ amount: 1 }));
  const result = await h.api.createJsapiPayment({ description: 'test', outTradeNo: 'test', amount: 1, openid: 'mini-payer' });
  assert.equal(h.requests[0].body.appid, 'wx2222222222222222');
  assert.equal(h.requests[0].body.payer.openid, 'mini-payer');
  assert.equal(result.client.package, 'prepay_id=synthetic-prepay');
});
