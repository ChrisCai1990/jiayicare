const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveJourneySnapshot, candidateStatus } = require('../src/utils/researchCareJourney');

test('research candidate becomes ready only after parsing and both human reviews without an annual plan', () => {
  const snapshot = deriveJourneySnapshot({ reports: [{ aiStatus: 'reviewed', audit_status: 'audited', familyDoctorAudit: { status: 'audited' } }] });
  assert.equal(candidateStatus(snapshot), 'ready');
});
test('existing annual plan is historical and overdue followups remain visible in the projection', () => {
  const snapshot = deriveJourneySnapshot({ annualPlan: { _id: 'a', reviewStatus: 'approved' }, followUps: [{ status: 'planned', assignedTo: 'staff', date: '2020-01-01' }] });
  assert.equal(candidateStatus(snapshot), 'historical');
  assert.equal(snapshot.followUp.overdue, 1);
});
