const test = require('node:test');
const assert = require('node:assert/strict');
const { nativePushReady } = require('../src/utils/nativePushConfig');
test('push requires explicit switch, matching application credential and nonempty secret', () => {
  const keys = ['NATIVE_PUSH_ENABLED', 'HUAWEI_PUSH_CLIENT_ID', 'HUAWEI_PUSH_CLIENT_SECRET'];
  const previous = keys.map(k => process.env[k]);
  try {
    for (const [flag, id, secret, expected] of [
      ['false','119164097','test',false], ['true','wrong','test',false],
      ['true','119164097','',false], ['true','119164097','test',true],
    ]) {
      [flag,id,secret].forEach((v,i) => { process.env[keys[i]] = v; });
      assert.equal(nativePushReady(), expected);
    }
  } finally { keys.forEach((k,i) => { if(previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; }); }
});
