const AppointmentReminder = require('../models/AppointmentReminder');
const Message = require('../models/Message');

const HOUR = 60 * 60 * 1000;

function buildAppointmentReminderTimes(appointmentDate) {
  const at = new Date(appointmentDate);
  if (Number.isNaN(at.getTime())) return [];
  return [
    { kind: 'day_before', remindAt: new Date(at.getTime() - 24 * HOUR) },
    { kind: 'two_hours_before', remindAt: new Date(at.getTime() - 2 * HOUR) },
  ];
}

async function scheduleExpertAppointmentReminders({ order, appointmentDate, appointmentText, now = new Date() }) {
  for (const item of buildAppointmentReminderTimes(appointmentDate)) {
    if (item.remindAt <= now) continue;
    await AppointmentReminder.findOneAndUpdate(
      { orderId: order._id, kind: item.kind },
      { $set: { user: order.user, remindAt: item.remindAt, appointmentAt: new Date(appointmentDate), appointmentText, status: 'pending', processingAt: null, sentAt: null } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
}

async function scanAndSendAppointmentReminders(now = new Date()) {
  await AppointmentReminder.updateMany(
    { status: 'processing', processingAt: { $lt: new Date(now.getTime() - 10 * 60 * 1000) } },
    { $set: { status: 'pending', processingAt: null } },
  );
  let sent = 0;
  while (true) {
    const reminder = await AppointmentReminder.findOneAndUpdate(
      { status: 'pending', remindAt: { $lte: now } },
      { $set: { status: 'processing', processingAt: now } },
      { sort: { remindAt: 1 }, new: true },
    );
    if (!reminder) break;
    try {
      const label = reminder.kind === 'day_before' ? '明天' : '2小时后';
      await Message.findOneAndUpdate(
        { dedupeKey: `expert-appointment-reminder:${reminder.orderId}:${reminder.kind}` },
        { $setOnInsert: {
          user: reminder.user, type: 'system', sender: '嘉医管家', title: '专家就诊提醒',
          content: `${label}是您的专家门诊预约，请提前安排出行并携带就诊所需资料。\n${reminder.appointmentText}`,
          unread: true, isAI: false, aiGenerated: false,
          dedupeKey: `expert-appointment-reminder:${reminder.orderId}:${reminder.kind}`,
          action: { type: 'expert_appointment_reminder', orderId: String(reminder.orderId) },
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      reminder.status = 'sent'; reminder.sentAt = now; reminder.processingAt = null;
      await reminder.save();
      sent++;
    } catch (error) {
      await AppointmentReminder.updateOne({ _id: reminder._id }, { $set: { status: 'pending', processingAt: null } });
      console.error('[appointment-reminder] 发送失败', error.message);
      break;
    }
  }
  return sent;
}

function startAppointmentReminderScheduler() {
  scanAndSendAppointmentReminders().catch(error => console.error('[appointment-reminder] 首次扫描失败', error.message));
  const timer = setInterval(() => scanAndSendAppointmentReminders().catch(error => console.error('[appointment-reminder] 定时扫描失败', error.message)), 60 * 1000);
  timer.unref();
}

module.exports = { buildAppointmentReminderTimes, scheduleExpertAppointmentReminders, scanAndSendAppointmentReminders, startAppointmentReminderScheduler };
