const test = require('node:test'), assert = require('node:assert/strict');
const { closeServiceOriginal } = require('../src/utils/serviceOutcomeClosure');
const { successorSpec } = require('../src/utils/serviceReviewSuccessor');
const { sourceDigest } = require('../src/utils/reportFollowUpSource');
const query = value => ({ lean: async () => value });
function setup() {
  const patient = { _id: 'p', assignedHealthManager: 'hm', assignedFamilyDoctor: 'a' };
  const report = { _id: 'r', user: 'p', sourceHealthPlanId: 's', audit_status: 'audited' };
  const review = { _id: 'v', patientId: 'p', sourceHealthPlanId: 's', assignedTo: 'a', status: 'completed', completedAt: new Date(), formData: {
    checksComplete: true, reviewSummary: '已核对', followUpContent: '后续安排', followUpDate: '2026-10-10', reviewedReportSources: [{ id: 'r', digest: sourceDigest(report) }] } };
  const task = { _id: 't', patientId: 'p', status: 'in_progress', continuityRequired: true };
  const next = successorSpec(review, patient), links = [{ _id: 'l', followUpId: 't' }];
  const args = { patient, review, actor: { _id: 'a', role: 'familyDoctor' }, Link: { find: () => query(links) },
    Report: { find: () => query(report.audit_status === 'audited' ? [report] : []) },
    FollowUp: { findById: id => query(id === 't' ? task : next) }, fence: async x => x.proof };
  return { args, task, next, links, report, review };
}
test('reuse service decision and successor without another report draft', async () => {
  const f = setup(), proof = await closeServiceOriginal(f.args);
  assert.equal(proof.sourceServiceReviewId, 'v'); assert.deepEqual(proof.nextFollowUpIds, [f.next._id]);
});
for (const [label, mutate] of Object.entries({
  withdrawn: f => { f.report.audit_status = 'pending' }, changed: f => { f.report.examConclusion = 'new' },
  cancelled: f => { f.next.status = 'cancelled' }, edited: f => { f.next.plannedContent = 'new' },
  ambiguous: f => { f.links.push({ followUpId: 'other' }) }, incomplete: f => { f.review.formData.checksComplete = false },
  wrongAdvisor: f => { f.args.actor._id = 'other' },
})) test(`${label} leaves original open`, async () => {
  const f = setup(); mutate(f); await assert.rejects(closeServiceOriginal(f.args), { statusCode: 409 });
  assert.equal(f.task.status, 'in_progress');
});
test('unlinked service never guesses an original', async () => { const f = setup(); f.links.length = 0; assert.equal(await closeServiceOriginal(f.args), null); });
