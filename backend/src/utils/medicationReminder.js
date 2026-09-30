const { randomUUID } = require('node:crypto');
const { schedule } = require('../../../shared/medicationReminder.cjs');
const saving = new Set();

async function saveReminder({ med, patientId, staff, body, FollowUp, User, now = new Date() }) {
  const key = String(med._id);
  if (saving.has(key)) throw Object.assign(new Error('提醒正在保存，请稍后重试'), { statusCode: 409 });
  saving.add(key);
  try {
    const enabled = body.enabled !== false;
    let config;
    try { config = enabled ? schedule(body, med, now) : null; }
    catch (err) { throw Object.assign(err, { statusCode: 400 }); }
    const base = { patientId, sourceType: 'medication_reminder', sourceId: med._id };
    // Only replace untouched future reminders. Completed records and explicit human
    // handoffs remain evidence, including when their scheduled date is in the future.
    const replaceable = { ...base, status: 'planned', date: { $gte: now }, tags: { $nin: ['人工跟进'] }, completedByUser: { $ne: true } };
    const old = await FollowUp.find(replaceable).select('_id').lean();
    const protectedRows = enabled ? await FollowUp.find({ ...base, status: { $ne: 'cancelled' }, $or: [
      { status: { $ne: 'planned' } }, { tags: '人工跟进' }, { completedByUser: true },
    ] }).select('date').lean() : [];
    const occupied = new Set(protectedRows.map(row => +new Date(row.date)));
    const patient = enabled ? await User.findById(patientId).select('assignedHealthManager') : null;
    const assignee = patient?.assignedHealthManager || med.staffId || staff._id;
    const batch = `medication:${randomUUID()}`;
    const rows = (config?.dates || []).filter(({ date }) => !occupied.has(+date)).map(({ date, time }) => ({
      ...base, staffId: assignee, assignedTo: assignee, date, type: 'other', status: 'planned',
      theme: `用药提醒 · ${med.name} · ${time}`,
      plannedContent: `请按医嘱使用${med.name}（${med.dosage}，${med.frequency}${med.timing ? `，${med.timing}` : ''}）。本次提醒时间：${time}（北京时间）。服用后可确认完成，如有不适或需要帮助请联系健管专员。${config.note ? `\n提醒备注：${config.note}` : ''}`,
      tags: ['用药提醒', 'AI自动计划'], sourceScheduleKey: batch,
    }));
    const previous = med.reminder?.toObject?.() || med.reminder || {};
    try {
      if (rows.length) await FollowUp.insertMany(rows);
      const { dates, ...stored } = config || {};
      med.reminder = { ...previous, ...stored, enabled, updatedAt: now, updatedBy: staff._id };
      await med.save();
    } catch (err) {
      // insertMany may have partially succeeded; clean only this attempt, leaving
      // the previous schedule intact on validation/storage failure.
      await FollowUp.deleteMany({ ...base, sourceScheduleKey: batch });
      med.reminder = previous;
      throw err;
    }
    if (old.length) await FollowUp.deleteMany({ ...replaceable, _id: { $in: old.map(row => row._id) } });
    return { generated: rows.length, message: enabled ? `已生成${rows.length}次客户用药提醒` : '已关闭用药提醒，已完成记录和人工跟进保留' };
  } finally { saving.delete(key); }
}
module.exports = { saveReminder };
