const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

test('large report buffers use multipart upload while small buffers use put', async () => {
  const calls = [];
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'ali-oss') return class MockOSS {
      constructor(options) { calls.push({ method: 'client', options }); }
      async put(key, buffer, options) { calls.push({ method: 'put', key, size: buffer.length, options }); }
      async multipartUpload(key, buffer, options) { calls.push({ method: 'multipart', key, size: buffer.length, options }); }
    };
    return originalLoad.call(this, request, parent, isMain);
  };
  const previous = Object.fromEntries(['OSS_REGION', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET', 'OSS_BUCKET'].map(key => [key, process.env[key]]));
  Object.assign(process.env, { OSS_REGION: 'oss-cn-shanghai', OSS_ACCESS_KEY_ID: 'test', OSS_ACCESS_KEY_SECRET: 'test', OSS_BUCKET: 'test-bucket' });
  try {
    delete require.cache[require.resolve('../src/utils/oss')];
    const { uploadBuffer } = require('../src/utils/oss');
    const small = await uploadBuffer(Buffer.alloc(1024), 'application/pdf');
    const large = await uploadBuffer(Buffer.alloc(12 * 1024 * 1024), 'application/pdf');
    assert.equal(calls.filter(call => call.method === 'put').length, 1);
    assert.equal(calls.filter(call => call.method === 'multipart').length, 1);
    assert.equal(calls.find(call => call.method === 'multipart').options.partSize, 1024 * 1024);
    assert.equal(calls.find(call => call.method === 'multipart').options.timeout, 120_000);
    assert.equal(calls.find(call => call.method === 'multipart').options.mime, 'application/pdf');
    assert.equal(large.size, 12 * 1024 * 1024);
    assert.match(small.url, /^https:\/\/test-bucket\./);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve('../src/utils/oss')];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
