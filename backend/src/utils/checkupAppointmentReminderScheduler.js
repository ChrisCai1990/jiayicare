const FollowUp = require('../models/FollowUp');
const Message = require('../models/Message');

const clientKey = /^checkup_appointment_(?:client_)?reminder:/;
const uploadKey = /^checkup_appointment_upload_reminder:/;

async function scanCheckupAppointmentReminders(now = new Date()) {
  let sent = 0;
  while (true) {
    const reminder = await FollowUp.findOneAndUpdate(
      { sourceType: 'order', status: 'planned', remindAt: { $lte: now }, sourceScheduleKey: { $regex: /^(checkup_appointment_(?:client_)?reminder:|checkup_appointment_upload_reminder:)/ } },
      { $set: { status: 'in_progress', executedContent: '正在发送客户提醒' } },
      { sort: { remindAt: 1 }, new: true },
    );
    if (!reminder) break;
    try {
      const isUpload = uploadKey.test(reminder.sourceScheduleKey || '');
      const title = isUpload ? '请上传检查报告和病历' : '检查预约提醒';
      const content = isUpload
        ? '本次检查及看诊已结束。请在客户端上传各检查项目对应的检查报告；如有门诊病历也请一并上传。健管专员将在资料齐全后生成后续随访计划。'
        : reminder.content;
      await Message.findOneAndUpdate(
        { dedupeKey: `checkup-appointment-reminder:${reminder._id}` },
        { $setOnInsert: { user: reminder.patientId, type: 'planner', sender: 'AI健康规划师', title, content, conversationId: `${reminder.patientId}_planner`, isAI: true, unread: true, dedupeKey: `checkup-appointment-reminder:${reminder._id}`, action: { type: isUpload ? 'checkup_upload_reminder' : 'checkup_appointment_reminder', orderId: String(reminder.sourceOrderId) } } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      reminder.status = 'completed'; reminder.completedAt = now; reminder.completedBy = 'staff'; reminder.executedContent = '客户提醒已发送'; await reminder.save(); sent++;
    } catch (error) {
      await FollowUp.updateOne({ _id: reminder._id }, { $set: { status: 'planned', executedContent: '' } });
      console.error('[checkup-appointment-reminder] 发送失败', error.message); break;
    }
  }
  return sent;
}

function startCheckupAppointmentReminderScheduler() {
  scanCheckupAppointmentReminders().catch(error => console.error('[checkup-appointment-reminder] 首次扫描失败', error.message));
  const timer = setInterval(() => scanCheckupAppointmentReminders().catch(error => console.error('[checkup-appointment-reminder] 定时扫描失败', error.message)), 60 * 1000);
  timer.unref();
}

module.exports = { scanCheckupAppointmentReminders, startCheckupAppointmentReminderScheduler, clientKey, uploadKey };
