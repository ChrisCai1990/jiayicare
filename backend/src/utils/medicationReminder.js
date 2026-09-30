const { schedule } = require('../../../shared/medicationReminder.cjs');
const { syncCombinedMedicationReminder } = require('./combinedMedicationReminder');
const saving = new Set();
async function saveReminder({ med, patientId, staff, body, FollowUp, now = new Date(), sync = syncCombinedMedicationReminder }) {
  const key = String(patientId);
  if (saving.has(key)) throw Object.assign(new Error('提醒正在保存，请稍后重试'), { statusCode: 409 });
  saving.add(key);
  try {
    const enabled = body.enabled !== false;
    let config;
    try { config = enabled ? schedule(body, med, now) : null; }
    catch (err) { throw Object.assign(err, { statusCode: 400 }); }
    const previous = med.reminder?.toObject?.() || med.reminder || {};
    const { dates, ...stored } = config || {};
    med.reminder = { ...previous, ...stored, enabled, updatedAt: now, updatedBy: staff._id };
    await med.save();
    let plan;
    try { plan = await sync(patientId, now); }
    catch (err) { med.reminder = previous; await med.save(); throw err; }
    // Keep clinical/human evidence. Replace untouched legacy dose tasks only after
    // the single recurring reminder is durably available.
    await FollowUp.updateMany({ patientId, sourceType: 'medication_reminder', status: 'planned',
      'formData.medicationPlanId': { $exists: false }, date: { $gte: now }, tags: { $nin: ['人工跟进'] }, completedByUser: { $ne: true }, 'progressRecords.0': { $exists: false } },
      { $set: { status: 'cancelled', cancelReason: '已合并至客户持续用药提醒，同一时间的药物合并通知' } });
    return { generated: plan?.enabled ? 1 : 0, reminderId: plan?._id,
      message: enabled ? '已保存用药提醒；同一时间的药物合并为一条消息，到点提醒' : '已关闭该药提醒，其他药物提醒保留' };
  } finally { saving.delete(key); }
}
module.exports = { saveReminder };
