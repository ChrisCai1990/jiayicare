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
test('journey detail identifies review gaps and distinguishes draft and task states', () => {
  const snapshot = deriveJourneySnapshot({
    reports: [{ _id: 'report1', documentCategory: 'outpatient_record', audit_status: 'audited', familyDoctorAudit: { status: 'pending' } }],
    drafts: [{ _id: 'draft1', reportId: 'report1', status: 'no_action' }],
    annualPlan: { _id: 'plan1', reviewStatus: 'approved' },
    followUps: [{ _id: 'task1', status: 'cancelled', date: '2020-01-01' }],
    now: new Date('2026-01-01'),
  });
  assert.equal(snapshot.report.items[0].advisorStatus, 'pending');
  assert.equal(snapshot.draft.items[0].status, 'no_action');
  assert.equal(snapshot.followUp.items[0].overdue, false);
  assert.equal(snapshot.followUp.completed, 0);
});
