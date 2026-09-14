const FollowUp = require('../models/FollowUp');
const Medication = require('../models/Medication');
const Supplement = require('../models/Supplement');

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextReminderData(completed, config) {
  return {
    patientId: completed.patientId,
    staffId: completed.staffId,
    assignedTo: completed.assignedTo || completed.staffId,
    date: addDays(completed.completedAt || new Date(), config.intervalDays),
    type: config.mode === 'proxy' ? 'other' : 'wechat',
    status: 'planned',
    theme: completed.theme,
    plannedContent: completed.plannedContent,
    tags: completed.tags || [],
    sourceType: 'supply_reminder',
    sourceId: completed.sourceId,
    sourceScheduleKey: `rolling-supply:${completed._id}`,
  };
}

async function generateNextSupplyReminder(completed) {
  if (completed.sourceType !== 'supply_reminder' || !completed.sourceId) return null;
  const recordFilter = { _id: completed.sourceId, user: completed.patientId, stopped: false, 'supplyReminder.enabled': true };
  const record = await Medication.findOne(recordFilter).lean() || await Supplement.findOne(recordFilter).lean();
  if (!record) return null;

  const existingOpen = await FollowUp.findOne({
    patientId: completed.patientId,
    sourceType: 'supply_reminder',
    sourceId: completed.sourceId,
    status: { $in: ['planned', 'in_progress'] },
    _id: { $ne: completed._id },
  });
  if (existingOpen) return existingOpen;

  const data = nextReminderData(completed, record.supplyReminder);
  return FollowUp.findOneAndUpdate(
    { sourceType: 'supply_reminder', sourceScheduleKey: data.sourceScheduleKey },
    { $setOnInsert: data },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { addDays, nextReminderData, generateNextSupplyReminder };
