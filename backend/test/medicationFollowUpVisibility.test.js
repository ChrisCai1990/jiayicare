const test = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { routineMedicationNoiseFilter, disposableMedicationSlotsFilter } = require('../src/utils/medicationFollowUpVisibility');

test('routine cancelled and daily dose rows disappear, while actual follow-up evidence stays', () => {
  const base = { sourceType: 'medication_reminder', status: 'cancelled', tags: ['用药提醒'], executedContent: '', completedAt: null };
  assert.equal(sift(routineMedicationNoiseFilter)(base), true);
  assert.equal(sift(routineMedicationNoiseFilter)({ ...base, status: 'planned', sourceScheduleKey: 'medication-day-slot:patient:time' }), true);
  assert.equal(sift(routineMedicationNoiseFilter)({ ...base, tags: ['人工跟进'] }), false);
  assert.equal(sift(routineMedicationNoiseFilter)({ ...base, progressRecords: [{ requestId: 'reviewed' }] }), false);
  assert.equal(sift(routineMedicationNoiseFilter)({ ...base, completedByUser: true }), false);
  assert.equal(sift(disposableMedicationSlotsFilter)({ ...base, sourceScheduleKey: 'medication-day-slot:patient:time' }), true);
  assert.equal(sift(disposableMedicationSlotsFilter)(base), false);
});

test('daily refresh removes untouched old slots without creating new follow-up rows', async () => {
  const FollowUp = require('../src/models/FollowUp');
  const Reminder = require('../src/models/Reminder');
  const { refreshDailyMedicationWindow } = require('../src/utils/combinedMedicationReminder');
  const originalDelete = FollowUp.deleteMany;
  const originalInsert = FollowUp.updateOne;
  const originalReminderUpdate = Reminder.updateOne;
  let deleted = 0;
  let updated = 0;
  FollowUp.deleteMany = async filter => { deleted++; assert.equal(filter.patientId, 'patient'); assert.equal(filter.sourceType, 'medication_reminder'); };
  FollowUp.updateOne = async () => { throw new Error('daily follow-up created'); };
  Reminder.updateOne = async (filter, update) => { updated++; assert.equal(filter._id, 'plan'); assert.equal(update.$set.medicationWindowDate, '2026-10-01'); };
  try {
    await refreshDailyMedicationWindow({ _id: 'plan', user: 'patient', enabled: true }, [], new Date('2026-10-01T10:00:00+08:00'));
    assert.equal(deleted, 1);
    assert.equal(updated, 1);
  } finally {
    FollowUp.deleteMany = originalDelete;
    FollowUp.updateOne = originalInsert;
    Reminder.updateOne = originalReminderUpdate;
  }
});
