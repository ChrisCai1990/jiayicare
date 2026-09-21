const test = require('node:test'), assert = require('node:assert/strict');
const { reviewOutcome } = require('../src/utils/followUpOutcomeReview');
const { sourceDigest } = require('../src/utils/reportFollowUpSource');
function fixture() {
  const task = { _id: 't', patientId: 'p', status: 'in_progress', continuityRequired: true, updatedAt: new Date('2026-09-21') };
  const report = { _id: 'r', user: 'p', audit_status: 'audited', followUpSourceEvent: { sequence: 1 } };
  const draft = { _id: 'd', patientId: 'p', reportId: 'r', status: 'approved', advisorReviewedBy: 'a', advisorReviewedAt: new Date(), followUpPublication: { status: 'published' },
    sourceSequence: 1, sourceKey: `r:1:${sourceDigest(report)}`, followUpDrafts: [{ date: '2026-10-01', requiresService: true }] };
  let service = [{ _id: 'service', assignedTo: 'planner' }], next = [{ _id: 'next', assessmentActionKey: 'd:dynamic:0:2026-10-01', assignedTo: 'hm' }];
  const args = { id: 't', actor: { _id: 'a', role: 'familyDoctor' }, body: { updatedAt: task.updatedAt, checksComplete: true, note: '已核对', decision: 'new_plan', reportIds: ['r'], reportDraftId: 'd' },
    User: { findById: () => ({ lean: async () => ({ assignedFamilyDoctor: 'a' }) }) },
    Report: { find: () => ({ lean: async () => report.audit_status === 'audited' ? [report] : [] }) },
    Draft: { findById: () => ({ lean: async () => draft }) },
    FollowUp: { findById: () => ({ lean: async () => task }), find: q => ({ lean: async () => q.taskRole ? service : next }),
      findOneAndUpdate: async (_, update) => ({ ...task, ...update.$set }) } };
  return { args, draft, report, task, noService: () => { service = [] }, noNext: () => { next = [] } };
}
test('complete exact published plan and service proof closes original', async () => { const f = fixture(); const r = await reviewOutcome(f.args); assert.equal(r.status, 'completed'); assert.deepEqual(r.outcomeReview.nextFollowUpIds, ['next']); });
test('explicit no-further decision needs no fabricated successor', async () => { const f = fixture(); f.args.body.decision = 'no_further'; delete f.args.body.reportDraftId; const r = await reviewOutcome(f.args); assert.deepEqual(r.outcomeReview.nextFollowUpIds, []); });
test('merged no-further retains approved empty draft provenance', async () => { const f = fixture(); f.args.body.decision = 'no_further'; f.draft.followUpDrafts = []; const r = await reviewOutcome(f.args); assert.equal(r.outcomeReview.sourceDraftId, 'd'); });
test('no-further cannot bypass a selected draft with future actions', async () => { const f = fixture(); f.args.body.decision = 'no_further'; await assert.rejects(reviewOutcome(f.args), { statusCode: 409 }); });
for (const [name, mutate] of Object.entries({
  'missing successor': f => f.noNext(), 'missing service handoff': f => f.noService(),
  'unpublished draft': f => { f.draft.followUpPublication.status = 'pending' },
  'withdrawn report audit': f => { f.report.audit_status = 'unaudited' },
  'changed source': f => { f.report.examConclusion = 'changed' },
  'stale original': f => { f.args.body.updatedAt = '2026-09-20' },
})) test(name + ' leaves original open', async () => { const f = fixture(); mutate(f); await assert.rejects(reviewOutcome(f.args), { statusCode: 409 }); assert.equal(f.task.status, 'in_progress'); });
test('unassigned advisor cannot confirm', async () => { const f = fixture(); f.args.actor._id = 'other'; await assert.rejects(reviewOutcome(f.args), { statusCode: 403 }); });
