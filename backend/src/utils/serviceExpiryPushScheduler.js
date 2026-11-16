const { chinaDay, resolveServiceAccess } = require('./serviceAccess');
const { createHash } = require('node:crypto');
const { Types } = require('mongoose');
const reminderDays = new Set([7, 3, 1]);

function oneMonthBefore(day) {
  const [year, month, date] = day.split('-').map(Number);
  const targetMonth = new Date(Date.UTC(year, month - 2, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return `${targetMonth.getUTCFullYear()}-${String(targetMonth.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(date, lastDay)).padStart(2, '0')}`;
}

function staffTaskId(key) {
  return new Types.ObjectId(createHash('sha256').update(`renewal-reminder:${key}`).digest('hex').slice(0, 24));
}

function isAnnualService(user, access) {
  if (access.source === 'verified_renewal') return true;
  if (/年度|一年|全年|pkg_1y/i.test(String(user.servicePackage || ''))) return true;
  if (!access.startDate) return false;
  const duration = (new Date(`${access.endDate}T00:00:00Z`) - new Date(`${access.startDate}T00:00:00Z`)) / 86400000;
  return duration >= 364 && duration <= 366;
}

async function scanServiceExpiryPush(now = new Date(), models = {}) {
  const User = models.User || require('../models/User');
  const Message = models.Message || require('../models/Message');
  const FollowUp = models.FollowUp || require('../models/FollowUp');
  const Admin = models.Admin || require('../models/Admin');
  const resolve = models.resolve || resolveServiceAccess;
  const users = await User.find({ isDeleted: { $ne: true } }).select('_id name tenantId assignedHealthManager servicePackage serviceStartDate serviceExpiry isDeleted').lean();
  const today = chinaDay(now);
  let created = 0;
  for (const user of users) {
    try {
      const access = await resolve(user, now);
      if (!access.active || !access.endDate) continue;
      const remaining = Math.round((new Date(`${access.endDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000);
      const renewalStage = isAnnualService(user, access)
        ? today === oneMonthBefore(access.endDate) ? 'month' : remaining === 15 ? '15days' : ''
        : '';
      if (!renewalStage && !reminderDays.has(remaining)) continue;
      if (renewalStage) {
        const nextDay = new Date(`${access.endDate}T12:00:00Z`);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        const nextAccess = await resolve(user, nextDay);
        if (nextAccess.active && nextAccess.endDate > access.endDate) continue;
      }
      const dedupeKey = `service-expiry:${user._id}:${access.endDate}:${renewalStage || remaining}`;
      const result = await Message.updateOne({ dedupeKey }, { $setOnInsert: {
        user: user._id, type: 'system', sender: '嘉医管家', title: renewalStage ? '年度会员续约提醒' : '服务到期提醒',
        content: renewalStage
          ? `您的年度会员服务将于 ${access.endDate} 到期。如需继续享受服务，请联系健管专员办理续约；健管专员也会主动与您联系。`
          : `您的当前服务期将于 ${access.endDate} 到期，剩余 ${remaining} 天。若需续约，请在 App 内提交需求或联系健管专员。`,
        pushCategory: 'service_exp', unread: true, dedupeKey,
      } }, { upsert: true, setDefaultsOnInsert: true });
      created += result.upsertedCount || 0;
      if (renewalStage) {
        let manager = user.assignedHealthManager
          ? await Admin.findOne({ _id: user.assignedHealthManager, ...(user.tenantId ? { tenantId: user.tenantId } : {}), role: 'healthManager', staffStatus: { $ne: 'inactive' } }).select('_id tenantId').lean()
          : null;
        if (!manager) manager = await Admin.findOne({ tenantId: user.tenantId || null, role: 'healthManager', staffStatus: { $ne: 'inactive' } }).sort({ _id: 1 }).select('_id tenantId').lean();
        if (!manager) {
          console.warn('[service-expiry-push] no health manager', String(user._id));
          continue;
        }
        const id = staffTaskId(dedupeKey);
        const content = `客户${user.name || ''}的年度会员服务将于 ${access.endDate} 到期（${renewalStage === 'month' ? '提前1个月' : '提前15天'}提醒）。请主动联系客户核对续约意向并跟进办理；客户尚未启用客户端时也需人工联系。`;
        await FollowUp.updateOne({ _id: id }, { $setOnInsert: {
          _id: id, tenantId: user.tenantId || null, patientId: user._id, staffId: manager._id,
          assignedTo: manager._id, clientVisible: false, date: now, remindAt: now,
          type: 'other', status: 'planned', theme: '年度会员续约提醒',
          content, plannedContent: content, tags: ['续约提醒'], workflowKey: `renewal:${renewalStage}:${access.endDate}`,
        } }, { upsert: true, setDefaultsOnInsert: true });
      }
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
