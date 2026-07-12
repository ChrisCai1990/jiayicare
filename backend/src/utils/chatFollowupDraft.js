const User = require('../models/User');
const Message = require('../models/Message');
const ServiceRecord = require('../models/ServiceRecord');

// 聊天角色 → 生成草稿的服务记录类型 / 角色展示名 / 记录标签
const CHAT_DRAFT_ROLE_MAP = {
  manager:      { recordType: 'routine',         label: '健管专员', recordLabel: '日常随访' },
  doctor:       { recordType: 'doctor_followup',  label: '家庭医生', recordLabel: '医生随访' },
  nutritionist: { recordType: 'nutrition',        label: '营养师',   recordLabel: '营养干预' },
};

// 时间范围简写 → 天数（仅用于"首次生成"时回看多久；此后自动从上次截止点接续，不会漏中间内容）
const CHAT_DRAFT_RANGE_DAYS = { today: 1, '3d': 3, week: 7 };

// 核心生成逻辑：从聊天记录提炼一条服务记录草稿。staffId 可选（人工触发时传当前专员id，
// 定时任务批量生成时留空，审核确认时再补上审核人）。
// 返回 { status: 'created'|'reused'|'skip', record?, message? }
async function generateChatFollowupDraft({ patientId, role = 'manager', range = 'today', staffId = null }) {
  const roleCfg = CHAT_DRAFT_ROLE_MAP[role] ? role : 'manager';
  const { recordType, label, recordLabel } = CHAT_DRAFT_ROLE_MAP[roleCfg];
  const days = CHAT_DRAFT_RANGE_DAYS[range] || CHAT_DRAFT_RANGE_DAYS.today;

  const user = await User.findById(patientId).select('name');
  if (!user) return { status: 'skip', message: '患者不存在' };

  const existingPending = await ServiceRecord.findOne({ patientId, type: recordType, aiStatus: 'pending' });
  if (existingPending) return { status: 'reused', record: existingPending };

  const rangeEnd = new Date();
  const lastApproved = await ServiceRecord.findOne({ patientId, type: recordType, aiStatus: 'approved' }).sort({ aiRangeEnd: -1 });
  const rangeStart = lastApproved?.aiRangeEnd || new Date(rangeEnd.getTime() - days * 24 * 60 * 60 * 1000);

  const conversationId = `${patientId}_${roleCfg}`;
  const messages = await Message.find({ conversationId, createdAt: { $gt: rangeStart, $lte: rangeEnd } }).sort({ createdAt: 1 });
  if (messages.length === 0) return { status: 'skip', message: `该患者与${label}在${lastApproved ? '上次生成之后' : '所选时段内'}无新聊天记录` };

  const chatText = messages.map(m => `${m.type === 'user' ? '患者' : label}：${m.content}`).join('\n');
  const isDoctor = roleCfg === 'doctor';
  const prompt = isDoctor
    ? `你是协助家庭医生整理沟通记录的助手。以下是家庭医生与患者${user.name}在${days === 1 ? '当日' : days + '天内'}的聊天记录，请提炼成一条"医生随访"记录草稿，内容仅基于聊天记录中双方实际交流的信息总结，不要凭空添加或推测聊天记录之外的诊断、用药建议或医疗判断。此草稿最终会交由医生本人审核修改后才正式生效。若聊天记录与健康管理无实质关联，content中如实说明"本次沟通无实质随访内容"。

【聊天记录】
${chatText}

请严格按以下JSON格式输出（仅JSON，不要其他文字）：
{"title":"本次随访主题（10字内）","content":"随访要点摘要（100-200字，包含患者近期状态/主诉、医生实际给出的回应或建议、患者反馈情况）","result":"结论性评估（30-50字，基于聊天记录总结，供医生审核确认）","nextDate":"YYYY-MM-DD 或 null"}`
    : `你是${label}的随访记录助手。以下是${label}与患者${user.name}在${days === 1 ? '当日' : days + '天内'}的聊天记录，请提炼成一条"${recordLabel}"服务记录，不要逐句复述聊天内容，要总结随访的核心信息。若聊天记录与健康管理无实质关联，content中如实说明"本次沟通无实质随访内容"。

【聊天记录】
${chatText}

请严格按以下JSON格式输出（仅JSON，不要其他文字）：
{"title":"本次随访主题（10字内）","content":"随访要点摘要（100-200字，包含患者近期状态/主诉、${label}给出的建议或干预、患者反馈或依从情况）","result":"结论性评估（30-50字）","nextDate":"YYYY-MM-DD 或 null"}`;

  const { chat } = require('./ai');
  let text;
  try {
    text = await chat([{ role: 'user', content: prompt }], { maxTokens: 800 });
  } catch (err) {
    return { status: 'skip', message: 'AI生成失败：' + err.message };
  }

  let parsed;
  try {
    parsed = JSON.parse((text || '').replace(/```json|```/g, '').trim());
  } catch {
    return { status: 'skip', message: 'AI返回内容解析失败' };
  }

  const parsedNextDate = parsed.nextDate && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.nextDate).trim())
    ? new Date(parsed.nextDate) : null;

  const record = await ServiceRecord.create({
    staffId, patientId, type: recordType, date: new Date(),
    title: parsed.title || '', content: parsed.content || '', result: parsed.result || '',
    nextDate: parsedNextDate,
    aiStatus: 'pending', aiSourceMessageIds: messages.map(m => m._id), aiGeneratedAt: new Date(),
    aiRangeStart: rangeStart, aiRangeEnd: rangeEnd,
  });
  return { status: 'created', record };
}

module.exports = { generateChatFollowupDraft, CHAT_DRAFT_ROLE_MAP, CHAT_DRAFT_RANGE_DAYS };
