const test = require('node:test'), assert = require('node:assert/strict');
const { requestHelp } = require('../src/utils/followUpHelp');
const task = { _id: 't', patientId: 'p', status: 'in_progress', updatedAt: new Date('2026-09-21'), isBlocked: true };
test('help records escalation without completing, reopening or unlocking the plan', async () => {
  let filter, patch;
  const FollowUp = { findOneAndUpdate: async (q, u) => { filter = q; patch = u; return { ...task, ...u.$set }; } };
  const result = await requestHelp({ FollowUp, task, body: { needFollowUp: true } });
  assert.equal(result.status, 'in_progress'); assert.equal(result.isBlocked, true);
  assert.equal(result.completedByUser, false); assert.equal(filter.patientId, 'p');
  assert.equal(filter.updatedAt, task.updatedAt); assert.equal(filter.status, task.status);
  assert.deepEqual(patch.$addToSet, { tags: '人工跟进' });
  assert.equal(patch.$set.status, undefined); assert.equal(patch.$set.outcomeReview, undefined);
});
test('completion/cancellation cannot use help endpoint to bypass review', async () => {
  for (const body of [{}, { needFollowUp: false }, { needFollowUp: true, done: false }]) {
    await assert.rejects(requestHelp({ task, body }), { statusCode: 409 });
  }
});
test('closed plans and concurrent advisor closure are preserved', async () => {
  for (const status of ['completed', 'cancelled']) await assert.rejects(requestHelp({ task: { ...task, status }, body: { needFollowUp: true } }), { statusCode: 409 });
  await assert.rejects(requestHelp({ task, body: { needFollowUp: true }, FollowUp: { findOneAndUpdate: async () => null } }), { statusCode: 409 });
});
