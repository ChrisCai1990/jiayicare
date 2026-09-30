// Explicit, single-patient operation. Never invoked on startup or for all users.
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { syncCombinedMedicationReminder } = require('./combinedMedicationReminder');
async function consolidateMedicationFollowUps(patientId, { expectedName, now = new Date() } = {}) {
  const User = require('../models/User'), Admin = require('../models/Admin'), FollowUp = require('../models/FollowUp');
  const patient = await User.findOne({ _id: patientId, name: expectedName, isDeleted: { $ne: true } }).lean();
  if (!patient) throw new Error('客户核对失败');
  const manager = await Admin.findOne({ _id: patient.assignedHealthManager, role: 'healthManager', staffStatus: { $ne: 'inactive' } }).lean();
  if (!manager) throw new Error('所属健管专员不可用');
  const previous = await FollowUp.find({ patientId, sourceType: 'medication_reminder', 'formData.medicationPlanId': { $exists: false }, status: { $in: ['planned','in_progress','missed'] } }).lean();
  if (previous.some(row => row.status !== 'planned' || row.completedByUser || row.progressRecords?.length || row.executedContent)) {
    throw new Error('存在已执行或客户反馈，需单独复核，未合并');
  }
  const plan = await syncCombinedMedicationReminder(patientId, now);
  if (!plan?.enabled) throw new Error('没有有效的客户用药提醒计划');
  const key = `medication:staff-followup:${patientId}`;
  const _id = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(key).digest('hex').slice(0,24));
  const content = `持续跟进本疗程用药提醒及客户反馈。客户按设置的${plan.reminderTime}时段收到当次合并提醒；核对实际服用情况、不适及续药需求，需专业判断时转健康顾问。\n${plan.description}\n疗程结束日期：${new Date(+plan.endDate + 8*3600000).toISOString().slice(0,10)}。完成本疗程跟进后再结束本事项。`;
  const fields = { patientId, staffId: manager._id, assignedTo: manager._id, date: now, type: 'wechat', status: 'planned',
    theme: '用药提醒持续跟进', content, plannedContent: content, tags: ['用药跟进','人工跟进'],
    workflowKey: 'medication:staff-followup', sourceScheduleKey: key, repeatDaily: false,
    formData: { creationSource: 'explicit_user_request', combinedReminderId: String(plan._id), replacedTaskIds: previous.map(x=>String(x._id)) } };
  await new FollowUp({ _id, ...fields }).validate();
  await FollowUp.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true, setDefaultsOnInsert: true });
  const task = await FollowUp.findById(_id).lean();
  if (!['planned','in_progress'].includes(task.status)) throw new Error('原持续跟进已结束，未覆盖其记录');
  const retired = await FollowUp.updateMany({ _id: { $in: previous.map(x=>x._id) }, patientId, status:'planned',
    completedByUser: { $ne: true }, 'progressRecords.0': { $exists:false }, executedContent: { $in:['',null] } },
    { $set: { status:'cancelled', cancelReason:'按用户要求合并至持续用药提醒与单条健管跟进事项' } });
  return { reminderId: plan._id, staffTaskId: _id, retired: retired.modifiedCount, assignee: manager.name };
}
module.exports = { consolidateMedicationFollowUps };
