const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('blood pressure consent button respects WeChat four-character limit', () => {
  const source = read('src/components/BloodPressurePhoto.jsx');
  assert.match(source, /confirmText: '同意选图'/);
  assert.doesNotMatch(source, /confirmText: '同意并选图'/);
});

test('blood sugar and weight photo capture are additive to manual entry', () => {
  const checkin = read('src/pages/checkin/index.jsx');
  const add = read('src/pages/records/add/index.jsx');
  assert.match(checkin, /<BloodSugarPhoto/);
  assert.match(checkin, /<WeightPhoto/);
  assert.match(checkin, /MEASURE_FIELDS\[measureModal\.measureType\]/);
  assert.match(add, /<BloodSugarPhoto/);
  assert.match(add, /<WeightPhoto/);
  assert.match(add, /activeType\.fields\.map/);
});

test('invite share uses fixed cover while preserving invite code login path', () => {
  const source = read('src/pages/profile/invite/index.jsx');
  assert.match(source, /imageUrl: inviteShareCover/);
  assert.match(source, /\/pages\/auth\/login\/index\?invite=\$\{encodeURIComponent\(code\)\}/);
});

test('startup requests hydrate persisted token before sending', () => {
  const source = read('src/services/api.js');
  assert.match(source, /const requestToken = _token \|\| loadToken\(\)/);
  assert.match(source, /if \(requestToken\) headers\['Authorization'\]/);
  assert.match(source, /if \(requestToken\) \{\s*clearToken\(\)/);
});
