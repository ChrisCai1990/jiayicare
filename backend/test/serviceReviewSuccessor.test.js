const test = require('node:test'), assert = require('node:assert/strict');
const { successorSpec, ensureServiceReviewSuccessor } = require('../src/utils/serviceReviewSuccessor');
const review = { _id: 'review', patientId: 'p', sourceHealthPlanId: 'service', assignedTo: 'advisor', status: 'completed', completedAt: new Date(), formData: { followUpDate: '2026-10-10', followUpContent: '合成后续安排' } };
const patient = { _id: 'p', assignedHealthManager: 'manager' };
test('stable source, manager ownership and continuous plan', () => {
  const row = successorSpec(review, patient);
  assert.equal(row.assignedTo, 'manager'); assert.equal(row.continuityRequired, true);
  assert.equal(row.formData.sourceReviewTaskId, 'review');
  assert.equal(row._id, successorSpec(review, patient)._id);
  assert.ok(row.updatedAt);
});
test('missing ownership, wrong patient and invalid dates rejected', () => {
  assert.throws(() => successorSpec(review, { _id: 'p' }));
  assert.throws(() => successorSpec(review, { ...patient, _id: 'other' }));
  assert.throws(() => successorSpec({ ...review, formData: { ...review.formData, followUpDate: '2026-02-30' } }, patient));
});
test('retry keeps completed successor and timestamp untouched', async () => {
  const row = { ...successorSpec(review, patient), status: 'completed', content: '人工更新' };
  const FollowUp = { findOneAndUpdate: async (filter, update, options) => {
    assert.deepEqual(Object.keys(update), ['$setOnInsert']); assert.equal(options.timestamps, false); return row;
  } };
  assert.equal((await ensureServiceReviewSuccessor({ FollowUp, review, patient })).content, '人工更新');
  row.status = 'cancelled'; await assert.rejects(ensureServiceReviewSuccessor({ FollowUp, review, patient }));
});
