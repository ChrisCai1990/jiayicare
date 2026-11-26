const test = require('node:test');
const assert = require('node:assert/strict');
const { signGroupMediaUrl } = require('../src/utils/oss');

test('group polls keep the same signed image until renewal, including report thumbnails', t => {
  for (const [key, value] of Object.entries({
    OSS_BUCKET:'synthetic-test-bucket', OSS_REGION:'oss-cn-shanghai',
    OSS_ACCESS_KEY_ID:'synthetic-id', OSS_ACCESS_KEY_SECRET:'synthetic-secret',
  })) process.env[key] = value;
  const start = 1800000000000;
  t.mock.timers.enable({apis:['Date'], now:start});
  const file = 'https://synthetic-test-bucket.oss-cn-shanghai.aliyuncs.com/messages/a.jpg';
  const signed = signGroupMediaUrl(file);
  const expires = url => Number(new URL(url).searchParams.get('Expires'));
  assert.equal(expires(signed), start / 1000 + 600);
  for (const seconds of [2,4,6,298]) {
    t.mock.timers.setTime(start + 1000 * seconds);
    assert.equal(signGroupMediaUrl(file), signed);
    assert.equal(signGroupMediaUrl('', 'messages/a.jpg'), signed);
  }
  t.mock.timers.setTime(start + 300000);
  assert.equal(expires(signGroupMediaUrl(file)), expires(signed) + 300);
});