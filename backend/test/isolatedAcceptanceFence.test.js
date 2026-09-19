const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('isolated harness blocks external HTTP, fetch, sockets and subprocesses without contacting them', () => {
  const script = `
    const assert = require('node:assert/strict');
    require('./integration/startIsolatedAcceptance').installNetworkFence();
    for (const attempt of [
      () => fetch('https://example.invalid'),
      () => require('node:http').get('http://example.invalid'),
      () => require('node:https').request('https://example.invalid'),
      () => new (require('node:net').Socket)().connect({host:'example.invalid', port:443}),
      () => new (require('node:net').Socket)().connect({host:'127.0.0.1', port:27017}),
      () => require('node:child_process').spawn('untrusted-program'),
    ]) assert.throws(attempt, /ISOLATED_ACCEPTANCE_EXTERNAL_IO_BLOCKED/);
  `;
  const result = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
test('isolated launcher requires explicit opt-in before database access', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'integration/startIsolatedAcceptance.js')], {
    env: { ...process.env, RUN_ISOLATED_ACCEPTANCE: '' }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Explicit RUN_ISOLATED_ACCEPTANCE/);
});
