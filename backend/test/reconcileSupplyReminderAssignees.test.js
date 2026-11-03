const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileSupplyReminderAssignees } = require('../src/utils/reconcileSupplyReminderAssignees');

test('仅纠正尚未开始且误派给所属顾问的配取随访', async () => {
  const updates = [];
  const tasks = [
    { _id: 'wrong', patientId: 'patient', assignedTo: 'advisor', status: 'planned' },
    { _id: 'manual', patientId: 'patient', assignedTo: 'other', status: 'planned' },
  ];
  const count = await reconcileSupplyReminderAssignees({
    FollowUp: {
      find: () => ({ select: () => ({ lean: async () => tasks }) }),
      updateOne: async (filter, update) => { updates.push({ filter, update }); return { modifiedCount: 1 }; },
    },
    User: { find: () => ({ select: () => ({ lean: async () => [{ _id: 'patient', assignedFamilyDoctor: 'advisor', assignedHealthManager: 'manager' }] }) }) },
  });
  assert.equal(count, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter._id, 'wrong');
  assert.equal(updates[0].update.$set.assignedTo, 'manager');
});
