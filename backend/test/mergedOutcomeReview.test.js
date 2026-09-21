const test = require('node:test'), assert = require('node:assert/strict');
const load = () => import('../../staff/src/utils/mergedOutcomeReview.mjs');
function fixture() {
  const calls = [], draft = { _id: 'd', reportId: 'r', status: 'advisor_review', __v: 1, followUpDrafts: [{ title: 'next' }] };
  const args = { item: { _id: 't', updatedAt: 'version' }, reportIds: ['r'], decision: 'new_plan', note: 'confirmed', checked: true, draft,
    api: { reviewReportFollowUpDraft: async () => { calls.push('publish'); return { data: { ...draft, status: 'approved', followUpPublication: { status: 'published' } } }; },
      reviewFollowUpOutcome: async (_, body) => { calls.push('close'); return body; } } };
  return { args, calls };
}
test('single confirmation publishes before closing exact original', async () => {
  const { args, calls } = fixture(); const result = await (await load()).submitMergedOutcome(args);
  assert.deepEqual(calls, ['publish', 'close']); assert.equal(result.reportDraftId, 'd'); assert.equal(result.updatedAt, 'version');
});
test('publication failed or transport error never closes original', async () => {
  for (const thrown of [false, true]) { const { args, calls } = fixture(); args.api.reviewReportFollowUpDraft = async () => { if (thrown) throw Error('network'); return { data: { status: 'approved', followUpPublication: { status: 'failed' } } }; };
    await assert.rejects((await load()).submitMergedOutcome(args)); assert.deepEqual(calls, []); }
});
test('already published retry does not review again', async () => {
  const { args, calls } = fixture(); Object.assign(args.draft, { status: 'approved', followUpPublication: { status: 'published' } });
  await (await load()).submitMergedOutcome(args); assert.deepEqual(calls, ['close']);
});
test('lost-response retry with changed edits cannot silently close against old approved content', async () => {
  const { args, calls } = fixture(); args.api.reviewReportFollowUpDraft = async () => ({ data: { ...args.draft, status: 'approved', followUpPublication: { status: 'published' }, followUpDrafts: [{ title: 'old approved content' }] } });
  await assert.rejects((await load()).submitMergedOutcome(args), /当前编辑不同/); assert.deepEqual(calls, []);
});
test('no further action approves empty conclusion before closure', async () => {
  const { args, calls } = fixture(); args.decision = 'no_further'; args.draft.followUpDrafts = [];
  await (await load()).submitMergedOutcome(args); assert.deepEqual(calls, ['publish', 'close']);
});
test('mismatched report or decision cannot approve or close', async () => {
  for (const patch of [{ reportIds: ['other'] }, { decision: 'no_further' }, { checked: false }]) {
    const { args, calls } = fixture(); await assert.rejects((await load()).submitMergedOutcome({ ...args, ...patch })); assert.deepEqual(calls, []);
  }
});
