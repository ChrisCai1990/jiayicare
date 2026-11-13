const { chinaDay, resolveServiceAccess } = require('./serviceAccess');
const reminderDays = new Set([7, 3, 1]);

async function scanServiceExpiryPush(now = new Date(), models = {}) {
  const User = models.User || require('../models/User');
  const Message = models.Message || require('../models/Message');
  const resolve = models.resolve || resolveServiceAccess;
  const users = await User.find({ isDeleted: { $ne: true } }).select('_id serviceStartDate serviceExpiry isDeleted').lean();
  const today = chinaDay(now);
  let created = 0;
  for (const user of users) {
    try {
      const access = await resolve(user, now);
      if (!access.active || !access.endDate) continue;
      const remaining = Math.round((new Date(access.endDate) - new Date(today)) / 86400000);
      if (!reminderDays.has(remaining)) continue;
      const dedupeKey = `service-expiry:${user._id}:${access.endDate}:${remaining}`;
      const result = await Message.updateOne({ dedupeKey }, { $setOnInsert: {
        user: user._id, type: 'system', sender: '嘉医管家', title: '服务到期提醒',
        content: `您的当前服务期将于 ${access.endDate} 到期，剩余 ${remaining} 天。若需续约，请在 App 内提交需求或联系健管专员。`,
        pushCategory: 'service_exp', unread: true, dedupeKey,
      } }, { upsert: true, setDefaultsOnInsert: true });
      await require('./nativePush').enqueueNativePush(await Message.findOne({ dedupeKey }).lean());
      created += result.upsertedCount || 0;
    } catch (error) { console.error('[service-expiry-push]', String(user._id), error.message); }
  }
  return created;
}

function startServiceExpiryPushScheduler() {
  const run = () => scanServiceExpiryPush().catch(error => console.error('[service-expiry-push]', error.message));
  setTimeout(run, 30000).unref();
  setInterval(run, 24 * 3600000).unref();
}
module.exports = { scanServiceExpiryPush, startServiceExpiryPushScheduler };
