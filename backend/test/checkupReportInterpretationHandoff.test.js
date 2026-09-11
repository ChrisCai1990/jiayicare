const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');

test('audited reports enter the family doctor interpretation queue until viewed', () => {
  assert.match(staffRoute, /report_interpretation:\s*'familyDoctor'/);
  assert.match(staffRoute, /audit_status:\s*'audited',[\s\S]*status:\s*'pending',[\s\S]*familyDoctorViewedAt:\s*null/);
  assert.match(staffRoute, /type:\s*'report_interpretation'[\s\S]*体检报告待解读/);
});
