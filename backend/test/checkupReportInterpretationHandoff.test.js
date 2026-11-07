const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const staffRoute = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');

test('audited reports remain queued until explicitly confirmed and are grouped by patient', () => {
  assert.match(staffRoute, /report_interpretation:\s*'familyDoctor'/);
  assert.match(staffRoute, /audit_status:\s*'audited',[\s\S]*status:\s*'pending',[\s\S]*advisorInterpretationConfirmedAt:\s*null/);
  assert.match(staffRoute, /documentCategory:\s*\{\s*\$nin:\s*\['prescription_order',\s*'outpatient_record'\]\s*\}/);
  assert.match(staffRoute, /reportsByPatient\.get\(patientId\)\.push\(r\)/);
  assert.match(staffRoute, /id: 'reportinterpret_patient_' \+ patientId/);
  assert.match(staffRoute, /medical-reports\/:id\/advisor-confirm/);
  assert.match(staffRoute, /type:\s*'report_interpretation'[\s\S]*体检报告待解读/);
});
