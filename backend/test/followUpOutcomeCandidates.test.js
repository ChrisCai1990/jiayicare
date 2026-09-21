const test = require('node:test'), assert = require('node:assert/strict');
const { outcomeCandidates } = require('../src/utils/followUpOutcomeCandidates');
const { sourceDigest } = require('../src/utils/reportFollowUpSource');
const query = value => ({ lean: async () => value });
function fixture() {
  const task = { _id: 't', patientId: 'p', continuityRequired: true };
  const report = { _id: 'r', user: 'p', audit_status: 'audited', followUpSourceEvent: { sequence: 1 } };
  const draft = { _id: 'd', patientId: 'p', reportId: 'r', sourceSequence: 1, sourceKey: `r:1:${sourceDigest(report)}`,
    followUpDrafts: [{}], advisorReviewedBy: 'a', advisorReviewedAt: new Date() };
  const args = { id: 't', actor: { _id: 'a', role: 'familyDoctor' }, FollowUp: { findById: () => query(task), find: () => query([{ _id: 'planner' }]) },
    User: { findById: () => query({ assignedFamilyDoctor: 'a' }) }, Link: { find: () => query([]) },
    Handoff: { find: () => query([{ servicePlanId: 'service' }]) }, Report: { find: q => { assert.equal(q.user, 'p'); assert.equal(q.audit_status, 'audited'); return query([report]); } },
    Draft: { find: () => query([draft]) } };
  return { args, task, report, draft };
}
test('no explicit source yields no suggestions, never guesses from patient', async () => {
  const { args } = fixture(); args.Report.find = () => { throw Error('must not query all patient reports'); };
  assert.deepEqual((await outcomeCandidates(args)).reportIds, []);
});
test('explicit service source suggests only audited same-patient reports and current draft', async () => {
  const { args } = fixture(); args.Link.find = q => { assert.equal(q.followUpId, 't'); return query([{ targetType: 'order', targetId: 'order' }]); };
  const find = args.Report.find; args.Report.find = q => { assert.deepEqual(q.$or, [{ sourceOrderId: 'order' }]); return find(q); };
  assert.deepEqual(await outcomeCandidates(args), { reportIds: ['r'], draftIds: ['d'], basis: 'explicit_service' });
});
test('annual schedule links only exact planner and active handoff', async () => {
  const { args, task } = fixture(); Object.assign(task, { sourceType: 'scheduled', sourceAnnualPlanId: 'annual', sourceScheduleKey: 'annual_checkup:2026-10-01' });
  args.FollowUp.find = q => { assert.equal(q.sourceScheduleKey, 'annual_checkup:2026-10-01:prepare:healthPlanner'); return query([{ _id: 'planner' }]); };
  args.Handoff.find = q => { assert.equal(q.plannerTaskId, 'planner'); assert.equal(q.status, 'active'); return query([{ servicePlanId: 'service' }]); };
  assert.deepEqual((await outcomeCandidates(args)).reportIds, ['r']);
  args.FollowUp.find = () => query([{ _id: 'a' }, { _id: 'b' }]);
  assert.deepEqual((await outcomeCandidates(args)).reportIds, []);
});
test('stale draft is not preselected', async () => {
  const { args, draft } = fixture(); args.Link.find = () => query([{ targetType: 'health_plan', targetId: 'service' }]); draft.sourceSequence = 0;
  assert.deepEqual((await outcomeCandidates(args)).draftIds, []);
});
test('other advisor and manager cannot read suggestions', async () => {
  for (const actor of [{ _id: 'other', role: 'familyDoctor' }, { _id: 'a', role: 'healthManager' }]) {
    const { args } = fixture(); await assert.rejects(outcomeCandidates({ ...args, actor }), { statusCode: 403 });
  }
});
