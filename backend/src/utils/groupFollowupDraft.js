const { createHash } = require('crypto');

// Conservative local rules: no customer conversation is sent to an external AI.
function classify(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const value = text.trim();
  const clinical = /胸痛|呼吸困难|晕厥|停药|加药|减药|药量|用药|不舒服|症状/.test(value);
  const change = /改期|改到|改为|推迟|提前|取消/.test(value);
  const follow = /随访|回访|复查|复诊|跟进|联系我|提醒我|帮我.{0,12}(看|约|安排)|报告.{0,10}(出来|看一下|看看|解读)|预约|安排.{0,12}(检查|就诊|复查)/.test(value);
  if (!clinical && !follow && !change) return null;
  if (!clinical && !change && /不用|不需要|无需|别再/.test(value)) return null;
  const kind = clinical ? '医护跟进' : change ? '变更核对' : '随访安排';
  return { kind, title: `${kind}：${value.replace(/\s+/g, ' ').slice(0, 60)}`, quote: value.slice(0, 1800), change };
}

function exactDate(text) {
  const match = text.match(/\b(20\d{2})[-年](\d{1,2})[-月](\d{1,2})(?:日|\b)/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const date = new Date(`${iso}T12:00:00+08:00`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === iso ? date : null;
}

function fingerprint(text, sender, sentAt) {
  const day = new Date(+new Date(sentAt) + 8 * 3600000).toISOString().slice(0, 10);
  return 'archive-' + createHash('sha256').update(`${sender}|${day}|${text.replace(/\s+/g, '')}`).digest('hex');
}

async function createDraft(group, message, models = {}) {
  const pick = classify(message.text);
  if (!pick) return 'ignored';
  const Entry = models.Entry || require('../models/ServiceGroupEntry');
  const requestKey = fingerprint(message.text, message.sender, message.sentAt);
  const existing = await Entry.findOne({ groupId: group._id, requestKey });
  if (existing) return 'duplicate';
  const value = {
    groupId: group._id, kind: 'task', status: 'draft', patientId: null,
    assignedTo: group.owner, createdBy: group.owner,
    title: pick.title,
    content: `群消息待核对（${new Date(message.sentAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}）\n原文：${pick.quote}\n\n请确认服务对象、日期及负责人。${pick.kind === '医护跟进' ? '涉及症状或用药，请交医护人员判断，不自动生成诊疗建议。' : ''}${pick.change ? '涉及变更，请核对原随访；正式随访不会自动改动。' : ''}`,
    dueAt: exactDate(message.text), requestKey, sourceMessageId: message.messageId,
    sourceType: 'wecom_archive',
    sourceText: message.text,
    history: [{ action: '群消息自动生成待确认草稿' }],
  };
  // Explicit quoted-message changes may update an untouched draft, never a confirmed task.
  if (pick.change && message.referencedMessageId) {
    const prior = await Entry.findOne({ groupId: group._id, sourceMessageId: message.referencedMessageId, sourceType: 'wecom_archive', status: 'draft' });
    if (prior && prior.history.length === 1) {
      const result = await Entry.updateOne({ _id: prior._id, __v: prior.__v, status: 'draft' }, {
        $set: { content: value.content, sourceText: value.sourceText, title: value.title, dueAt: value.dueAt, sourceMessageId: value.sourceMessageId, requestKey },
        $inc: { __v: 1 }, $push: { history: { action: '引用原消息的变更，待人工核对' } },
      });
      if (result.modifiedCount) return 'updated';
    }
  }
  await Entry.updateOne({ groupId: group._id, requestKey }, { $setOnInsert: value }, { upsert: true, runValidators: true });
  return 'created';
}

function validateConfirmation(entry, group) {
  const id = value => String(value?._id || value || '');
  if (!entry.patientId || !group.members.some(m => id(m.patientId) === id(entry.patientId))) return '请选择本群服务对象';
  if (!entry.dueAt || Number.isNaN(+new Date(entry.dueAt))) return '请确认跟进日期';
  if (!group.staffIds.some(staffId => id(staffId) === id(entry.assignedTo))) return '负责人必须属于本群服务团队';
  return null;
}

module.exports = { classify, exactDate, fingerprint, createDraft, validateConfirmation };
