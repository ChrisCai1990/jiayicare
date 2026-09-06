const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('商城购买沿用既有实名建档完成标志，不直接检查历史证件字段', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.match(source, /if \(!req\.user\.onboardingCompleted\)/);
  assert.doesNotMatch(source, /!String\(req\.user\.idNumber/);
});
