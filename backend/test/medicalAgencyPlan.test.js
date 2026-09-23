const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const route = fs.readFileSync(path.join(__dirname, '../src/routes/staff.js'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PlansPage.jsx'), 'utf8');

test('medical agency plans fix planner supervision and assign booking execution to the health manager', () => {
  assert.match(route, /isAgencyMedicalAssistPlan\(planContent, title\)/);
  assert.match(route, /supervisorId: patient\.assignedHealthPlanner, transport: '', hotel: ''/);
  assert.match(route, /agencyService \? patient\?\.assignedHealthManager/);
  assert.match(route, /agencyService \? patient\?\.assignedHealthPlanner/);
  assert.match(route, /!agencyService && !isCheckupService && !isOutpatientOneStop && !c\.staffId/);
});

test('agency form omits dispatch and logistics fields; medication form searches the member first', () => {
  assert.match(page, /const isAgencyService = selectedTpl\?\.content\?\.assistanceType === 'agency'/);
  assert.match(page, /!isAgencyService && !isMedicationProxy[^\n]*<div className="form-group"[\s\S]{0,90}就医专员/);
  assert.match(page, /!isAgencyService && !isMedicationProxy[^\n]*renderField\('交通接送'/);
  assert.match(page, /!isAgencyService && !isMedicationProxy[^\n]*renderField\('酒店安排'/);
  assert.match(page, /!isAgencyService && !isMedicalEscort[^\n]*<div className="form-group"[\s\S]{0,110}方案说明/);
  assert.ok(page.indexOf('<PatientSearchInput value={patientId} onChange={setPatientId} />') < page.indexOf('{isMedicationProxy && <div style='));
});
