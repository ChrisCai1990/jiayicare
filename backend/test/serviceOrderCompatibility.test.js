const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('正式小程序只有备注时不再被服务日期和内容阻断', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.doesNotMatch(source, /if \(!desiredServiceDate \|\| !confirmedServiceRequirements\)/);
  assert.match(source, /requiresServiceConfirmation && desiredServiceDate/);
});

test('商城基金开关由服务端按实时规则最大化重算', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/services.js'), 'utf8');
  assert.match(source, /maximize:true/);
});
