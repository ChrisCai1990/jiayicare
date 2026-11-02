const User = require('../models/User');
const Reminder = require('../models/Reminder');

// 旧版空 consentAt 同时表示“未开启”和“已关闭”。曾生成过基础提醒而当前为空的账户
// 视为曾主动关闭，避免默认开启发布后把这部分客户重新打开。
async function monitoringEnabled(user) {
  if (!user?.onboardingCompleted || user.isDeleted) return false;
  if (user.healthMonitoringPreference) return user.healthMonitoringPreference === 'enabled';
  const wasDisabled = !user.healthMonitoringConsentAt && Boolean(await Reminder.exists({
    user: user._id, systemManaged: true, sourceKey: /^service-cycle:/,
  }));
  const preference = wasDisabled ? 'disabled' : 'enabled';
  await User.updateOne({ _id: user._id, healthMonitoringPreference: { $exists: false } }, { $set: { healthMonitoringPreference: preference } });
  const current = await User.findById(user._id).select('healthMonitoringPreference').lean();
  return current?.healthMonitoringPreference === 'enabled';
}

module.exports = { monitoringEnabled };
