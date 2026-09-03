const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authPath = require.resolve('../src/middleware/auth');
const aiPath = require.resolve('../src/utils/ai');
let calls = 0;
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: (req, res, next) => {
  if (!req.headers.authorization) return res.status(401).json({ success: false });
  req.user = { _id: 'test-user' }; next();
} };
require.cache[aiPath] = { id: aiPath, filename: aiPath, loaded: true, exports: { parseImage: async () => {
  calls++; return '{"sys":128,"dia":82,"pulse":72}';
} } };
const router = require('../src/routes/bloodPressurePhoto');
const { validateConfirmation } = require('../src/utils/bloodPressurePhoto');
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
test('recognition endpoint requires auth and consent; produces confirmable draft only', async () => {
  process.env.JWT_SECRET = 'local-test-secret';
  process.env.QWEN_API_KEY = 'mock-provider';
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/recognize-blood-pressure';
  const post = (body, auth = true) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'test' } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await post({ image, consent: true }, false)).status, 401);
    assert.equal((await post({ image })).status, 400);
    assert.equal((await post({ image: 'https://localhost/private', consent: true })).status, 400);
    assert.equal(calls, 0);
    const response = await post({ image, consent: true });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { data } = await response.json();
    assert.equal(data.sys, 128);
    assert.equal(calls, 1);
    const body = { type: 'bloodPressure', unit: 'mmHg', value: '128/82', extra: { sys: 128, dia: 82, pulse: 72 }, imageUrl: image,
      recordedAt: '2026-01-01T08:00:00+08:00', photoRecognition: { token: data.token, confirmed: true } };
    assert.equal(validateConfirmation(body, 'test-user').originalValues.pulse, 72);
    delete process.env.QWEN_API_KEY;
    assert.equal((await post({ image, consent: true })).status, 503);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
