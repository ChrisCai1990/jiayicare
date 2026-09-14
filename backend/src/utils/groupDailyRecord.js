const { createHash } = require('crypto');

// Reuse the group record draft and native ServiceRecord confirmation workflow.
// Exact excerpts only: no inferred patient, diagnosis, measurement or completed action.
async function createDailyRecord(group, message, models = {}) {
  if (!group.archiveConsent || !message.text?.trim()) return 'ignored';
  const Entry = models.Entry || require('../models/ServiceGroupEntry');
  const day = new Date(+new Date(message.sentAt) + 8 * 3600000).toISOString().slice(0, 10);
  const time = new Date(message.sentAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
  const excerpt = `[${time} · ${message.sender}]\n${message.text.trim()}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const records = await Entry.find({ groupId: group._id, kind: 'record', sourceType: 'wecom_archive', sourceDay: day }).select('+sourceText').sort({ createdAt: -1 });
    if (records.some(e => e.sourceMessageIds.includes(message.messageId))) return 'duplicate';
    // Human editing seals a batch. Later messages create an addendum draft, never overwrite it.
    const prior = records.find(e => e.status === 'draft' && !e.history.some(h => h.actor) && e.sourceText.length + excerpt.length < 17000 && e.sourceMessageIds.length < 200);
    const sourceText = prior ? `${prior.sourceText}\n\n${excerpt}` : excerpt;
    const content = `当日群沟通摘录（待人工整理）\n${sourceText.slice(0, 18000)}${sourceText.length > 18000 ? '\n【长消息仅展示前段，请到原企业微信群核对完整原文】' : ''}\n\n请仅保留所选成员的沟通，核对实际服务内容；未来安排仍需在待办中确认。`;
    try {
      if (prior) {
        prior.sourceText = sourceText;
        prior.content = content;
        prior.aiGenerated = false;
        prior.professionalEvidence = [];
        prior.professionalRetryAt = null;
        prior.professionalError = false;
        prior.sourceMessageIds.push(message.messageId);
        await prior.save();
        return 'updated';
      }
      await Entry.create({
        groupId: group._id, kind: 'record', status: 'draft', patientId: null,
        assignedTo: group.owner, createdBy: group.owner,
        title: `${day} 日常沟通${records.length ? '补充' : ''}记录`, content, sourceText,
        dueAt: new Date(`${day}T12:00:00+08:00`), sourceType: 'wecom_archive', sourceDay: day,
        sourceMessageId: message.messageId, sourceMessageIds: [message.messageId],
        requestKey: 'daily-' + createHash('sha256').update(`${day}|${message.messageId}`).digest('hex'),
        history: [{ action: '按日整理群沟通，待人工核对成员和内容' }],
      });
      return 'created';
    } catch (e) {
      if (e.name !== 'VersionError' && e.code !== 11000) throw e;
    }
  }
  throw new Error('archive_daily_record_conflict');
}
module.exports = { createDailyRecord };
