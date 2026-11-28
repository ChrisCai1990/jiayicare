const crypto = require('node:crypto');
const Message = require('../models/Message');
const { dayKey } = require('../../../shared/followUpDue.cjs');

function noticeContent(plan, now = new Date()) {
  if (plan.type !== 'annual_checkup' || plan.status !== 'active' || !plan.pushedAt || !plan.checkupDate
    || ['draft', 'pending', 'rejected'].includes(plan.content?.aiStatus)) return null;
  const day = dayKey(plan.checkupDate);
  if (day < dayKey(now) || plan.actualCheckupDate) return null;
  const notes = [...new Set((plan.items || []).filter(item => item.status !== 'skipped' && item.notes?.trim())
    .map(item => item.name + '：' + item.notes.trim()))];
  if (!notes.length) return null;
  return ['计划体检日期：' + day, ...notes].join('\n');
}

async function syncNotice(plan, { direct = false } = {}) {
  const dedupeKey = 'checkup-preparation-notice:' + plan._id;
  const key = { user: plan.patientId, dedupeKey };
  const existing = await Message.findOne(key).select('content recalled action updatedAt').lean();
  if (!direct && !existing) return;
  const content = noticeContent(plan);
  if (!content) {
    if (existing && !existing.recalled) await Message.updateOne(key, { $set: { recalled: true, recalledAt: new Date(), unread: false } });
    if (direct) throw Object.assign(new Error('请核对计划日期和已发布的检前注意事项'), { statusCode: 409 });
    return;
  }
  if (existing?.content === content && !existing.recalled) return;
  const version = crypto.randomUUID();
  const message = { type: 'system', sender: '健康管理团队', title: existing ? '体检安排及注意事项已更新' : '体检前注意事项',
    content, unread: true, recalled: false, recalledAt: null, pushCategory: 'doctor',
    action: { type: 'checkup_preparation', planId: String(plan._id), version } };
  if (!existing) {
    await Message.updateOne(key, { $setOnInsert: { ...key, ...message } }, { upsert: true });
    return;
  }
  const updated = await Message.findOneAndUpdate({ ...key, updatedAt: existing.updatedAt, 'action.version': existing.action?.version },
    { $set: message }, { new: true });
  if (updated) await require('./nativePush').enqueueNativePush(updated, dedupeKey + ':' + version);
}
module.exports = { noticeContent, syncNotice };
