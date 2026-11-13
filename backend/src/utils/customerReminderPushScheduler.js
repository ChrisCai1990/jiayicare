const crypto = require('node:crypto');

const chinaDay = date => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 10);
const chinaTime = date => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(11, 16);
const weekday = day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${day}T00:00:00Z`).getUTCDay()];
const category = reminder => reminder.category === 'medication' ? 'medication'
  : ['monitoring', 'weight_checkin'].includes(reminder.category) ? 'measurement'
    : reminder.category === 'exercise_checkin' ? 'exercise' : 'system';

function isDue(reminder, now = new Date()) {
  if (!reminder?.enabled || reminder.systemManaged) return false;
  const day = chinaDay(now);
  const time = chinaTime(now);
  const scheduled = /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.reminderTime || '') ? reminder.reminderTime : '08:00';
  const scheduledAt = new Date(`${day}T${scheduled}:00+08:00`);
  if (+now < +scheduledAt || +now - +scheduledAt >= 5 * 60000) return false;
  if (reminder.scheduleType === 'once') return reminder.targetDate && chinaDay(reminder.targetDate) === day;
  if (reminder.scheduleType !== 'recurring') return false;
  if (reminder.startDate && chinaDay(reminder.startDate) > day) return false;
  if (reminder.endDate && chinaDay(reminder.endDate) < day) return false;
  if (reminder.customEveryNDays) {
    const anchor = chinaDay(reminder.startDate || reminder.createdAt || now);
    const days = Math.round((new Date(day) - new Date(anchor)) / 86400000);
    if (days < 0 || days % reminder.customEveryNDays !== 0) return false;
  }
  return !reminder.daysOfWeek?.length || reminder.daysOfWeek.includes(weekday(day));
}

async function scanCustomerReminders(now = new Date(), models = {}) {
  const Reminder = models.Reminder || require('../models/Reminder');
  const Message = models.Message || require('../models/Message');
  const User = models.User || require('../models/User');
  const enqueue = models.enqueue || require('./nativePush').enqueueNativePush;
  const reminders = await Reminder.find({ enabled: true, systemManaged: { $ne: true } }).lean();
  const monitoring = await Reminder.find({ enabled: true, systemManaged: true, sourceKey: /^service-cycle:/ }).lean();
  let sent = 0;
  for (const reminder of reminders) {
    if (!isDue(reminder, now)) continue;
    if (!await User.exists({ _id: reminder.user, isDeleted: { $ne: true } })) continue;
    const day = chinaDay(now);
    const time = reminder.reminderTime || '08:00';
    const dedupeKey = `customer-reminder:${reminder._id}:${day}:${time}`;
    const _id = new (models.ObjectId || require('mongoose').Types.ObjectId)(crypto.createHash('sha256').update(dedupeKey).digest('hex').slice(0, 24));
    const result = await Message.updateOne({ _id }, { $setOnInsert: {
      user: reminder.user, type: 'system', sender: '嘉医管家', title: reminder.title,
      content: reminder.description || '您设置的提醒时间到了，请打开 App 查看。',
      pushCategory: category(reminder), unread: true, dedupeKey,
    } }, { upsert: true, setDefaultsOnInsert: true });
    const message = await Message.findById(_id).lean();
    await enqueue(message);
    sent += result.upsertedCount || 0;
  }
  const monitoringModule = models.monitoring || (monitoring.length ? require('./annualPlanMonitoringReminders') : null);
  const monitorUsers = new Set();
  for (const reminder of monitoring) {
    const scheduled = /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.reminderTime || '') ? reminder.reminderTime : '08:00';
    const scheduledAt = new Date(`${chinaDay(now)}T${scheduled}:00+08:00`);
    if (+now >= +scheduledAt && +now - +scheduledAt < 5 * 60000 && monitoringModule.activeToday(reminder, now)) {
      monitorUsers.add(String(reminder.user));
    }
  }
  for (const userId of monitorUsers) await monitoringModule.syncMonitoringSystemMessage(userId, now, { sendPush: true });
  return sent;
}

function startCustomerReminderPushScheduler() {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await scanCustomerReminders(); }
    catch (error) { console.error('[customer-reminder-push]', error.message); }
    finally { busy = false; }
  };
  setTimeout(run, 15000).unref();
  setInterval(run, 60000).unref();
}
module.exports = { isDue, scanCustomerReminders, startCustomerReminderPushScheduler };
