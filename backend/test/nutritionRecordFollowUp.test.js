const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const { sync, taskIdFor, chinaDate } = require('../src/utils/nutritionRecordFollowUp');

test('nutrition record date creates one owned task, reschedules it, and clearing the date cancels it', async () => {
  const originals = { findById: FollowUp.findById, findOneAndUpdate: FollowUp.findOneAndUpdate, userFindById: User.findById };
  const recordId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();
  const nutritionistId = new mongoose.Types.ObjectId();
  const record = { _id: recordId, patientId, type: 'nutrition', title: '月度随访', aiStatus: null, nextDate: new Date('2026-11-05') };
  let task = null;
  try {
    FollowUp.findById = async id => {
      assert.equal(String(id), String(taskIdFor(recordId)));
      return task;
    };
    FollowUp.findOneAndUpdate = async (_filter, update) => {
      task = { ...update.$setOnInsert, save: async () => task };
      return task;
    };
    User.findById = () => ({ select: () => ({ lean: async () => ({ assignedNutritionist: nutritionistId, tenantId: null }) }) });

    await sync(record);
    assert.equal(String(task.assignedTo), String(nutritionistId));
    assert.equal(task.sourceType, 'service_record');
    assert.equal(String(task.sourceId), String(recordId));
    assert.equal(chinaDate(task.date), '2026-11-05');
    assert.equal(task.status, 'planned');

    record.nextDate = new Date('2026-11-12');
    await sync(record);
    assert.equal(chinaDate(task.date), '2026-11-12');

    record.nextDate = null;
    await sync(record);
    assert.equal(task.status, 'cancelled');

    record.nextDate = new Date('2026-11-19');
    await sync(record);
    assert.equal(task.status, 'planned');
    assert.equal(chinaDate(task.date), '2026-11-19');

    task.status = 'completed';
    record.nextDate = new Date('2026-11-26');
    await sync(record);
    assert.equal(chinaDate(task.date), '2026-11-19');
  } finally {
    FollowUp.findById = originals.findById;
    FollowUp.findOneAndUpdate = originals.findOneAndUpdate;
    User.findById = originals.userFindById;
  }
});

test('unapproved AI nutrition drafts do not schedule staff work', async () => {
  const original = FollowUp.findById;
  try {
    FollowUp.findById = async () => null;
    const result = await sync({ _id: new mongoose.Types.ObjectId(), type: 'nutrition', aiStatus: 'pending', nextDate: new Date('2026-11-05') });
    assert.equal(result, null);
  } finally { FollowUp.findById = original; }
});
