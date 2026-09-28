const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'src');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('medical resource knowledge has a controlled publication lifecycle', () => {
  const model = read('models', 'MedicalResourceKnowledge.js');
  const route = read('routes', 'settings.js');
  assert.match(model, /'draft', 'pending_review', 'published', 'returned', 'expired', 'archived'/);
  assert.match(route, /router\.patch\('\/medical-resource-knowledge\/:id\/submit'/);
  assert.match(route, /router\.patch\('\/medical-resource-knowledge\/:id\/review'/);
  assert.match(route, /已发布条目不可直接修改/);
});

test('staff can only retrieve published, unexpired knowledge and plans freeze references', () => {
  const route = read('routes', 'staff.js');
  assert.match(route, /router\.get\('\/medical-resource-knowledge', staffAuth/);
  assert.match(route, /status: 'published',\s*\$or: \[\{ expiresAt: null \}, \{ expiresAt: \{ \$gt: new Date\(\) \} \}\]/);
  assert.match(route, /async function freezeMedicalResourceReferences/);
  assert.match(route, /resourceReferences: await freezeMedicalResourceReferences/);
  assert.match(route, /resourceReferenceIds/);
});
