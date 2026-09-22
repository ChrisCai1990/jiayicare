const test = require('node:test');
const assert = require('node:assert/strict');
test('isolated UI rejects missing, remote and lookalike API addresses', async () => {
  const { resolveApiBase } = await import('../../staff/src/utils/isolatedApiBase.mjs');
  for (const url of [undefined, '', 'https://jiaycare.com/api', 'http://127.0.0.1.evil:3000/api', 'http://127.0.0.1:3000/api?redirect=remote']) {
    assert.throws(() => resolveApiBase({ VITE_ISOLATED_ACCEPTANCE: 'true', VITE_API_URL: url }), /隔离验收/);
  }
  assert.equal(resolveApiBase({ VITE_ISOLATED_ACCEPTANCE: 'true', VITE_API_URL: 'http://127.0.0.1:3000/api' }), 'http://127.0.0.1:3000/api');
  assert.equal(resolveApiBase({}), 'https://jiaycare.com/api');
});
