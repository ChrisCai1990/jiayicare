const test = require('node:test');
const assert = require('node:assert/strict');
const { canRead, allowedPsychologistPath } = require('../src/utils/psychologyAccess');
const care = { tenantId: 'a', advisorId: 'doctor', psychologistId: 'psych', status: 'active' };
const patient = { tenantId: 'a', assignedFamilyDoctor: 'doctor' };
const actor = (role, _id) => ({ tenantId: 'a', role, _id });
test('only responsible advisor and psychologist can read', () => {
  assert.equal(canRead(actor('familyDoctor', 'doctor'), care, patient), true);
  assert.equal(canRead(actor('psychologist', 'psych'), care, patient), true);
  for (const role of ['healthManager', 'nutritionist', 'superadmin', 'specialist', 'healthPlanner']) assert.equal(canRead(actor(role, 'doctor'), care, patient), false);
  assert.equal(canRead(actor('familyDoctor', 'other'), care, patient), false);
  assert.equal(canRead(actor('psychologist', 'other'), care, patient), false);
});
test('tenant, reassignment, deletion and closure revoke access', () => {
  assert.equal(canRead({ ...actor('familyDoctor', 'doctor'), tenantId: 'b' }, care, patient), false);
  assert.equal(canRead(actor('familyDoctor', 'doctor'), care, { ...patient, tenantId: 'b' }), false);
  assert.equal(canRead(actor('familyDoctor', 'doctor'), care, { ...patient, assignedFamilyDoctor: 'new' }), false);
  assert.equal(canRead(actor('psychologist', 'psych'), care, { ...patient, isDeleted: true }), false);
  assert.equal(canRead(actor('psychologist', 'psych'), { ...care, status: 'ended' }, patient), false);
  assert.equal(canRead(actor('familyDoctor', 'doctor'), { ...care, status: 'ended' }, patient), true);
});
test('legacy and lookalike paths denied for psychologists', () => {
  for (const path of ['/api/staff/patients', '/api/staff/reports', '/api/staff/service-records', '/api/staff/psychology-other', '/api/admin/users']) assert.equal(allowedPsychologistPath('GET', path), false);
  assert.equal(allowedPsychologistPath('GET', '/api/staff/psychology/abc?x=1'), true);
  assert.equal(allowedPsychologistPath('GET', '/api/staff/me'), true);
  assert.equal(allowedPsychologistPath('GET', '/api/staff/ai-workspace/status'), true);
  assert.equal(allowedPsychologistPath('POST', '/api/staff/ai-workspace/chat'), true);
  assert.equal(allowedPsychologistPath('GET', '/api/staff/ai-workspace/chat'), false);
  assert.equal(allowedPsychologistPath('PUT', '/api/staff/me/password'), true);
  assert.equal(allowedPsychologistPath('POST', '/api/staff/me'), false);
});
