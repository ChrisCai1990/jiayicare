const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileMonthlyFollowUpAssignees } = require('../src/utils/reconcileMonthlyFollowUpAssignees');
const { humanFollowUpQuery } = require('../src/utils/humanFollowUpQuery');
const { monthlyAssignees } = require('../src/utils/followupReview');

test('new monthly plans keep the advisor as reviewer and the manager as executor', () => {
  assert.deepEqual(monthlyAssignees({ assignedFamilyDoctor: 'doctor', assignedHealthManager: 'manager' }), {
    reviewAssignedTo: 'doctor', assignedTo: 'manager',
  });
});

test('workbench leaves AI drafts in the advisor review queue', () => {
  assert.deepEqual(humanFollowUpQuery.aiStatus, { $ne: 'pending' });
});

test('legacy monthly followups assigned to the advisor move to the patient manager', async () => {
  const updates = [];
  const tasks = [
    { _id: 'empty', patientId: 'patient', assignedTo: null, status: 'planned' },
    { _id: 'advisor', patientId: 'patient', assignedTo: 'doctor', status: 'missed' },
    { _id: 'specialist', patientId: 'patient', assignedTo: 'specialist', status: 'planned' },
  ];
  const models = {
    FollowUp: {
      find: query => {
        assert.equal(query.sourceType, 'ai_review');
        assert.equal(query.aiStatus, 'approved');
        assert.deepEqual(query.status.$in, ['planned', 'missed']);
        return { select: () => ({ lean: async () => tasks }) };
      },
      updateOne: async (filter, update) => {
        updates.push({ filter, update });
        return { modifiedCount: 1 };
      },
    },
    User: { find: () => ({ select: () => ({ lean: async () => [
      { _id: 'patient', assignedFamilyDoctor: 'doctor', assignedHealthManager: 'manager' },
    ] }) }) },
  };
  assert.equal(await reconcileMonthlyFollowUpAssignees(models), 2);
  assert.deepEqual(updates.map(item => item.filter._id), ['empty', 'advisor']);
  assert.ok(updates.every(item => item.update.$set.assignedTo === 'manager'));
});
