const test = require('node:test');
const assert = require('node:assert/strict');
const { describeEntry, regionForIP, summarizeSession, normalizeOrigin, loginIP } = require('../src/utils/loginOrigin');

test('classifies launch and recent scenes separately and keeps unknown scenes explicit', () => {
  const session = { device: { loginOrigin: { client: 'weapp', firstEntry: { scene: 1005 }, recentEntry: { scene: 1008 } } } };
  assert.equal(summarizeSession(session, true).entry, '微信搜索');
  assert.equal(summarizeSession(session, false).entry, '群聊分享');
  assert.equal(describeEntry({ scene: 9999 }), '微信场景 9999');
  assert.equal(normalizeOrigin({ client: 'made-up' }), undefined);
  assert.equal(summarizeSession({ method: 'phone_wechat' }, true).client, '');
});

test('resolves local IPv4 and IPv6 ranges and handles missing and private IPs', () => {
  assert.equal(regionForIP('120.24.78.68'), '广东省 · 深圳市');
  assert.equal(regionForIP('::ffff:120.24.78.68'), '广东省 · 深圳市');
  assert.ok(regionForIP('240e::1'));
  for (const ip of ['', 'bad', '127.0.0.1', '10.0.0.1', '::1']) assert.equal(regionForIP(ip), '');
});

test('uses the real IP set by the local reverse proxy and ignores client-supplied forwarding chains', () => {
  const headers = { 'x-real-ip': '120.24.78.68', 'x-forwarded-for': '8.8.8.8' };
  assert.equal(loginIP({ socket: { remoteAddress: '::ffff:127.0.0.1' }, headers }), '120.24.78.68');
  assert.equal(loginIP({ socket: { remoteAddress: '1.1.1.1' }, headers }), '1.1.1.1');
});

test('classifies the first mobile device across native, mini program and web logins', () => {
  for (const [device, userAgent, expected] of [
    [{ loginOrigin: { client: 'android' } }, '', '安卓'],
    [{ loginOrigin: { client: 'ios' } }, '', 'iOS'],
    [{ model: 'ADY-AL00' }, '', '安卓'],
    [{ platform: 'ios' }, '', 'iOS'],
    [{ system: 'HarmonyOS 5' }, '', '安卓'],
    [{}, 'Mozilla/5.0 (Linux; Android 13)', '安卓'],
    [{}, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18)', 'iOS'],
    [{ loginOrigin: { client: 'weapp' } }, '', ''],
  ]) {
    assert.equal(summarizeSession({ device, userAgent }, true).phoneType, expected);
    assert.equal(summarizeSession({ device, userAgent }, false).phoneType, undefined);
  }
});
