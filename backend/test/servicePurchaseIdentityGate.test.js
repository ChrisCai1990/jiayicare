const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('商城购买兼容完成标志及姓名证件联系电话齐全的历史实名档案', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.match(source, /hasVerifiedIdentityFields/);
  assert.match(source, /req\.user\.idNumber/);
  assert.match(source, /req\.user\.contactPhone \|\| req\.user\.phone/);
  assert.match(source, /if \(!req\.user\.onboardingCompleted && !hasVerifiedIdentityFields\)/);
});
