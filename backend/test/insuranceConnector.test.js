const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { ManualInsuranceConnector, getInsuranceConnector, registerInsuranceConnector, verifyWebhookSignature } = require('../src/utils/insuranceConnector');

test('未接保险公司时安全回退人工连接器', async () => {
  assert.equal(getInsuranceConnector('axa').provider, 'manual');
  assert.equal((await getInsuranceConnector('axa').verifyEligibility({ memberId: 'm1' })).status, 'requires_staff_review');
});

test('保险连接器可以按供应商注册', () => {
  const connector = new ManualInsuranceConnector(); connector.provider = 'sandbox';
  registerInsuranceConnector('sandbox', connector);
  assert.equal(getInsuranceConnector('sandbox').provider, 'sandbox');
});

test('Webhook 使用 HMAC SHA256 且拒绝错误签名', () => {
  const body = JSON.stringify({ eventId: 'evt-1' });
  const signature = crypto.createHmac('sha256', 'secret').update(body).digest('hex');
  assert.equal(verifyWebhookSignature(body, `sha256=${signature}`, 'secret'), true);
  assert.equal(verifyWebhookSignature(body, 'bad', 'secret'), false);
});
