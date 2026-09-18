const User = require('../models/User');
const { syncServiceCycleMonitoringReminders } = require('./annualPlanMonitoringReminders');

async function syncMonitoringReminderCycles() {
  const users = await User.find({ onboardingCompleted: true, isDeleted: { $ne: true } }).select('_id').lean();
  let synced = 0;
  for (let i = 0; i < users.length; i += 25) {
    const batch = users.slice(i, i + 25);
    const results = await Promise.allSettled(batch.map(user => syncServiceCycleMonitoringReminders(user._id)));
    synced += results.filter(item => item.status === 'fulfilled').length;
  }
  if (synced) console.log(`[monitoring-reminders] 已同步 ${synced} 位客户的服务周期提醒`);
  return synced;
}

function startMonitoringReminderScheduler() {
  setTimeout(() => syncMonitoringReminderCycles().catch(error => console.error('[monitoring-reminders] 首次同步失败', error.message)), 60 * 1000);
  setInterval(() => syncMonitoringReminderCycles().catch(error => console.error('[monitoring-reminders] 定时同步失败', error.message)), 24 * 60 * 60 * 1000);
}

module.exports = { syncMonitoringReminderCycles, startMonitoringReminderScheduler };
