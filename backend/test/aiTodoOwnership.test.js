const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'staff.js'), 'utf8');

test('健管体检报告待办仅包含本人可见客户', () => {
  assert.doesNotMatch(source, /reportPatientIds/);
  assert.doesNotMatch(source, /assignedHealthManager: null,[\s\S]*unassignedPatients/);
  assert.match(source, /const parseFilter = \{[\s\S]*user: \{ \$in: myPatientIds \}/);
  assert.match(source, /const reportFilter = \{[\s\S]*user: \{ \$in: myPatientIds \}/);
});
