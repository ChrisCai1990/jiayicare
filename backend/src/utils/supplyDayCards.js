const FollowUp = require('../models/FollowUp');
const { cards, keyOf, summary } = require('../../../shared/supplyDay.cjs');
const { workbenchDueExpression } = require('../../../shared/followUpDue.cjs');

const supplyFilter = { $or: [{ sourceType: 'supply_reminder' },
  { 'formData.adHocMedicalReminder': true, 'formData.reminderKind': 'medication' }] };

function stages() {
  const supply = { $or: [{ $eq: ['$sourceType', 'supply_reminder'] }, { $and: [
    { $eq: ['$formData.adHocMedicalReminder', true] }, { $eq: ['$formData.reminderKind', 'medication'] }] }] };
  const date = { $reduce: { input: { $ifNull: ['$progressRecords', []] }, initialValue: '$date', in: { $ifNull: ['$$this.nextContactAt', '$$value'] } } };
  return [
    { $set: { supplyDay: { $dateToString: { date, format: '%Y-%m-%d', timezone: 'Asia/Shanghai', onNull: null } }, due: workbenchDueExpression() } },
    { $group: { _id: { $cond: [{ $and: [supply, { $ne: ['$status', 'cancelled'] }, { $ne: ['$supplyDay', null] }] },
      { patient: '$patientId', day: '$supplyDay' }, '$_id'] }, ids: { $push: '$_id' }, date: { $min: '$due' }, completedAt: { $max: '$completedAt' } } },
  ];
}

// Only expose completed siblings within the caller's existing access filter.
async function attach(tasks, visibility, allowed = () => true) {
  const grouped = cards(tasks).filter(row => row.supplyKey);
  if (!grouped.length) return;
  const groups = new Map(grouped.map(row => [row.supplyKey, row]));
  const patients = [...new Set(grouped.map(row => String(row.items[0].patientId?._id || row.items[0].patientId)))];
  const days = grouped.map(row => row.day).sort();
  const window = { $gte: new Date(days[0] + 'T00:00:00+08:00'), $lt: new Date(+new Date(days.at(-1) + 'T00:00:00+08:00') + 86400000) };
  const done = await FollowUp.find({ $and: [visibility, supplyFilter, { patientId: { $in: patients }, status: 'completed', $or: [{date: window}, {'progressRecords.nextContactAt': window}] }] })
    .select('patientId sourceType theme status tags date progressRecords.nextContactAt formData plannedContent content workflowKey taskRole clientVisible followUpSchemeId')
    .populate('followUpSchemeId', 'name').lean();
  for (const row of grouped) row.details = new Map(row.items.map(task => [String(task._id), summary(task)]));
  for (const task of done) {
    const group = groups.get(keyOf(task));
    if (group && allowed(task)) group.details.set(String(task._id), summary(task));
  }
  for (const row of grouped) {
    const details = [...row.details.values()];
    for (const task of row.items) {
      task.supplyDay = { key: row.supplyKey, day: row.day, details };
    }
  }
}
module.exports = { stages, attach };
