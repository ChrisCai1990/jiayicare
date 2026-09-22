const test = require('node:test'), assert = require('node:assert/strict');
test('live acceptance permits only exact Qwen POST, serial six requests; other exits blocked', () => {
  const https = require('node:https'), http = require('node:http'), net = require('node:net');
  const { EventEmitter } = require('node:events');
  // Safety-policy unit test only; this stub is not live AI acceptance evidence.
  const original = https.request;
  https.request = () => new EventEmitter();
  require('./integration/liveAiFence').install();
  const valid = { hostname: 'dashscope.aliyuncs.com', path: '/compatible-mode/v1/chat/completions', method: 'POST' };
  for (const change of [{ hostname: 'example.com' }, { path: '/other' }, { method: 'GET' }, { port: 80 }, { agent: {} }, { createConnection() {} }]) {
    assert.throws(() => https.request({ ...valid, ...change }), /BLOCKED/);
  }
  assert.throws(() => http.request('http://example.com'), /BLOCKED/);
  assert.throws(() => fetch('https://example.com'), /BLOCKED/);
  assert.throws(() => new net.Socket().connect({ host: '127.0.0.1', port: 27017 }), /BLOCKED/);
  assert.throws(() => new net.Socket().connect({ host: 'dashscope.aliyuncs.com', port: 443 }), /BLOCKED/);
  assert.throws(() => require('node:child_process').spawn('cmd'), /BLOCKED/);
  for (let i = 0; i < 6; i++) {
    const request = https.request(valid); assert.throws(() => https.request(valid), /BLOCKED/); request.emit('close');
  }
  assert.throws(() => https.request(valid), /BLOCKED/);
  https.request = original;
});
