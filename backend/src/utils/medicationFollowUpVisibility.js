// Routine dose slots belong to one recurring Reminder plan, not to the service
// execution history. Keep any row with customer/staff activity for audit.
const noActivity = {
  sourceType: 'medication_reminder',
  tags: { $nin: ['人工跟进'] },
  completedByUser: { $ne: true },
  completedAt: null,
  'progressRecords.0': { $exists: false },
  executedContent: { $in: ['', null] },
};

const routineMedicationNoiseFilter = {
  ...noActivity,
  $or: [
    { status: 'cancelled' },
    { status: 'planned', sourceScheduleKey: /^medication-day-slot:/ },
    { status: 'planned', 'formData.medicationPlanId': { $exists: true } },
  ],
};

const disposableMedicationSlotsFilter = {
  ...noActivity,
  status: { $in: ['planned', 'cancelled'] },
  $or: [
    { sourceScheduleKey: /^medication-day-slot:/ },
    { 'formData.medicationPlanId': { $exists: true } },
  ],
};

module.exports = { routineMedicationNoiseFilter, disposableMedicationSlotsFilter };
