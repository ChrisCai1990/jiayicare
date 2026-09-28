const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('商城购买必须完成实名建档，不允许残缺历史字段绕过', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.doesNotMatch(source, /hasVerifiedIdentityFields/);
  assert.match(source, /if \(!req\.user\.onboardingCompleted\)/);
  assert.match(source, /REAL_NAME_REQUIRED/);
});
