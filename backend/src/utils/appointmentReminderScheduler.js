const AppointmentReminder = require('../models/AppointmentReminder');
const Message = require('../models/Message');
const Order = require('../models/Order');

const HOUR = 60 * 60 * 1000;

function buildAppointmentReminderTimes(appointmentDate) {
  const at = new Date(appointmentDate);
  if (Number.isNaN(at.getTime())) return [];
  return [
    { kind: 'day_before', remindAt: new Date(at.getTime() - 24 * HOUR) },
    { kind: 'two_hours_before', remindAt: new Date(at.getTime() - 2 * HOUR) },
  ];
}

async function scheduleExpertAppointmentReminders({ order, appointmentDate, appointmentText, slotIndex = null, now = new Date() }) {
  for (const item of buildAppointmentReminderTimes(appointmentDate)) {
    if (item.remindAt <= now) continue;
    const kind = slotIndex === null ? item.kind : `${item.kind}:${slotIndex}`;
    await AppointmentReminder.findOneAndUpdate(
      { orderId: order._id, kind },
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
      const order = await Order.findById(reminder.orderId).select('scheduledAt status medicalProxyPlan.booking').lean();
      const slots = order?.medicalProxyPlan?.booking?.appointmentSlots;
      const currentAppointments = Array.isArray(slots) && slots.length
        ? slots.map(row => new Date(`${row.appointmentDate}T${row.appointmentTime}:00+08:00`).getTime())
        : [new Date(order?.scheduledAt).getTime()];
      if (!order || order.status !== 'scheduled' || !currentAppointments.includes(new Date(reminder.appointmentAt).getTime())) {
        await AppointmentReminder.updateOne(
          { _id: reminder._id, status: 'processing', appointmentAt: reminder.appointmentAt },
          { $set: { status: 'cancelled', processingAt: null } },
        );
        continue;
      }
      const label = reminder.kind.startsWith('day_before') ? '明天' : '2小时后';
      const dedupeKey = `expert-appointment-reminder:${reminder.orderId}:${reminder.kind}:${new Date(reminder.appointmentAt).getTime()}`;
      await Message.findOneAndUpdate(
        { dedupeKey },
        { $setOnInsert: {
          user: reminder.user, type: 'system', sender: '嘉医管家', title: '专家就诊提醒',
          content: `${label}是您的专家门诊预约，请提前安排出行并携带就诊所需资料。\n${reminder.appointmentText}`,
          unread: true, isAI: false, aiGenerated: false,
          dedupeKey,
          action: { type: 'expert_appointment_reminder', orderId: String(reminder.orderId) },
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await AppointmentReminder.updateOne(
        { _id: reminder._id, status: 'processing', appointmentAt: reminder.appointmentAt },
        { $set: { status: 'sent', sentAt: now, processingAt: null } },
      );
      sent++;
    } catch (error) {
      await AppointmentReminder.updateOne(
        { _id: reminder._id, status: 'processing', appointmentAt: reminder.appointmentAt },
        { $set: { status: 'pending', processingAt: null } },
      );
      console.error('[appointment-reminder] 发送失败', error.message);
      break;
    }
  }
  return sent;
}

function startAppointmentReminderScheduler() {
  // Early versions stored the immediate appointment confirmation in the manager
  // conversation, so it did not appear in the customer's notification center.
  Message.updateMany(
    { dedupeKey: /^expert-appointment-confirmed:/, type: { $ne: 'system' } },
    { $set: { type: 'system', title: '专家就医提醒', conversationId: null, unread: true, readAt: null } },
  ).catch(error => console.error('[appointment-reminder] 历史确认消息迁移失败', error.message));
  scanAndSendAppointmentReminders().catch(error => console.error('[appointment-reminder] 首次扫描失败', error.message));
  const timer = setInterval(() => scanAndSendAppointmentReminders().catch(error => console.error('[appointment-reminder] 定时扫描失败', error.message)), 60 * 1000);
  timer.unref();
}

module.exports = { buildAppointmentReminderTimes, scheduleExpertAppointmentReminders, scanAndSendAppointmentReminders, startAppointmentReminderScheduler };
