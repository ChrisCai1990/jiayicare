const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { generateKeyPairSync, verify } = require('node:crypto');
const { createApnsPushTransport } = require('../src/utils/apnsPushTransport');
const { createPushDeviceRegistry } = require('../src/utils/pushDeviceRegistry');
const { nativePushReady } = require('../src/utils/nativePushConfig');
const token = 'a'.repeat(64), messageId = 'b'.repeat(24);
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
function mockTransport({ status = 200, hang = false } = {}) {
  const captured = {};
  return { captured, transport: createApnsPushTransport({
    keyId: 'ABCDEFGHIJ', teamId: 'AZGC9F6S4N', loadKey: () => pem,
    timeoutMs: 25, now: () => 1800000000000,
    connect: url => {
      captured.url = url;
      const client = new EventEmitter();
      client.destroy = () => { captured.destroyed = true; };
      client.request = headers => {
        captured.headers = headers;
        const stream = new EventEmitter(); stream.close = () => {};
        stream.end = body => {
          captured.body = JSON.parse(body);
          if (!hang) queueMicrotask(() => {
            stream.emit('response', { ':status': status });
            stream.emit('end');
          });
        };
        return stream;
      };
      return client;
    },
  }) };
}
test('APNs sends absolute badge and generic content, signed with ES256', async () => {
  const { transport, captured } = mockTransport();
  assert.deepEqual(await transport.send({ token, messageId, count: 120 }), { accepted: true });
  assert.equal(captured.url, 'https://api.push.apple.com');
  assert.equal(captured.headers['apns-topic'], 'com.jiayicare.app');
  assert.equal(captured.headers['apns-push-type'], 'alert');
  assert.equal(captured.body.aps.badge, 99);
  assert.deepEqual(Object.keys(captured.body).sort(), ['aps', 'kind']);
  assert.equal(captured.body.kind, 'service-message');
  const [header, payload, signature] = captured.headers.authorization.slice(7).split('.');
  assert.equal(JSON.parse(Buffer.from(header, 'base64url')).alg, 'ES256');
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url')).iss, 'AZGC9F6S4N');
  assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`),
    { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
  assert.ok(captured.destroyed);
});
test('zero badge is sent, invalid count and token are rejected before network', async () => {
  const { transport, captured } = mockTransport();
  await transport.send({ token, messageId, count: 0 });
  assert.equal(captured.body.aps.badge, 0);
  for (const count of [-1, 1.5, NaN]) await assert.rejects(transport.send({ token, messageId, count }));
  await assert.rejects(transport.send({ token: 'invalid', messageId, count: 1 }));
});
test('upstream failure and timeout never claim delivery or expose credentials', async () => {
  for (const options of [{ status: 403 }, { status: 410 }, { hang: true }]) {
    const { transport, captured } = mockTransport(options);
    await assert.rejects(transport.send({ token, messageId, count: 1 }),
      error => error.message === '苹果推送未确认接收');
    assert.ok(captured.destroyed);
  }
});
test('APNs registration keeps authenticated ownership and gates each provider', async () => {
  let saved;
  const registry = createPushDeviceRegistry({
    enabled: provider => provider === 'apns', Session: { exists: async () => true },
    Device: { findById: () => ({ select() { return this; }, lean: async () => null }),
      updateOne: async (filter, update) => { saved = { filter, update }; } },
  });
  await registry.register({ _id: 'real-user', tenantId: 'real-tenant' }, 'real-session',
    { provider: 'apns', token, user: 'attacker', tenantId: 'attacker', sessionId: 'attacker' });
  assert.equal(saved.update.$set.user, 'real-user');
  assert.equal(saved.update.$set.sessionId, 'real-session');
  assert.equal(saved.update.$set.provider, 'apns');
  await assert.rejects(registry.register({ _id: 'u' }, 's', { provider: 'huawei', token }),
    error => error.status === 503);
  await assert.rejects(registry.register({ _id: 'u' }, 's', { provider: 'apns', token: 'bad' }),
    error => error.status === 400);
});
test('registration refuses logged out sessions', async () => {
  let wrote = false;
  const registry = createPushDeviceRegistry({ enabled: () => true,
    Session: { exists: async () => false }, Device: { updateOne: async () => { wrote = true; } } });
  await assert.rejects(registry.register({ _id: 'u' }, 's', { provider: 'apns', token }),
    error => error.status === 401);
  assert.equal(wrote, false);
});
test('Apple capability does not depend on Huawei configuration', () => {
  const names = ['NATIVE_PUSH_ENABLED', 'IOS_PUSH_ENABLED', 'APNS_KEY_ID', 'APNS_TEAM_ID',
    'APNS_PRIVATE_KEY_PATH', 'HUAWEI_PUSH_CLIENT_ID'];
  const saved = Object.fromEntries(names.map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NATIVE_PUSH_ENABLED: 'true', IOS_PUSH_ENABLED: 'true',
      APNS_KEY_ID: 'ABCDEFGHIJ', APNS_TEAM_ID: 'AZGC9F6S4N', APNS_PRIVATE_KEY_PATH: '/private/apns.p8' });
    delete process.env.HUAWEI_PUSH_CLIENT_ID;
    assert.equal(nativePushReady('apns'), true);
    assert.equal(nativePushReady('huawei'), false);
    assert.equal(nativePushReady(), true);
    process.env.IOS_PUSH_ENABLED = 'false';
    assert.equal(nativePushReady('apns'), false);
  } finally {
    for (const key of names) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});
