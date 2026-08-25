const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'staff.js'), 'utf8');

test('健管体检报告待办仅包含本人客户和未分配客户', () => {
  assert.match(source, /assignedHealthManager: null,[\s\S]*isDeleted: \{ \$ne: true \}/);
  assert.match(source, /reportPatientIds = \[[\s\S]*\.\.\.\(myPatientIds \|\| \[\]\)[\s\S]*unassignedPatients\.map/);
  assert.doesNotMatch(source, /role === 'healthManager'\) \{\s*reportPatientIds = null/);
});
