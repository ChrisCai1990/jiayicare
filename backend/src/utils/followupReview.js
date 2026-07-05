const FollowUp = require('../models/FollowUp');
const HealthRecord = require('../models/HealthRecord');
const { chat } = require('./ai');

// 月度AI回顾核心逻辑：结合患者近30天打卡数据判断是否需要新增随访，需要则落库为 aiStatus:pending
// 供 staff.js 的单患者接口和定时任务共用。staffId 为该建议归属的随访人（人工触发用当前登录家医，定时任务用方案配置人）
async function runMonthlyFollowUpReview(user, staffId) {
  const since = new Date(Date.now() - 30 * 86400000);
  const records = await HealthRecord.find({ user: user._id, recordedAt: { $gte: since } })
    .sort({ recordedAt: -1 }).limit(60).lean();
  const recLines = records.length
    ? records.slice(0, 40).map(r => `${String(r.recordedAt).slice(0, 10)} ${r.label}：${r.value}${r.unit || ''}${r.status && r.status !== 'normal' ? '（异常）' : ''}`).join('\n')
    : '近30天无打卡数据';
  const lastFu = await FollowUp.findOne({ patientId: user._id }).sort({ date: -1 }).lean();
  const lastFuText = lastFu ? `${String(lastFu.date).slice(0, 10)}（${lastFu.theme || '常规'}）` : '无记录';

  const prompt = `你是慢病管理随访专员，请根据患者近期数据做月度回顾，判断是否需要新增随访并生成随访提纲。

【患者】姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}
【上次随访】${lastFuText}
【近30天打卡数据】
${recLines}

【今天日期】${new Date().toISOString().slice(0, 10)}（suggestedDate 必须晚于今天）
请严格按以下JSON输出（仅JSON）：
{
  "needed": true,
  "timingReason": "判断理由（30-60字）",
  "suggestedDate": "YYYY-MM-DD",
  "theme": "建议随访主题",
  "outline": ["随访提纲要点1", "要点2", "要点3"]
}`;

  const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1000 });
  let raw = {};
  try { const m = text.trim().match(/\{[\s\S]*\}/); if (m) raw = JSON.parse(m[0]); } catch {}
  if (!raw.needed) return null;

  return FollowUp.create({
    patientId: user._id,
    staffId,
    date: raw.suggestedDate ? new Date(raw.suggestedDate) : new Date(Date.now() + 7 * 86400000),
    theme: raw.theme || '月度回顾随访',
    status: 'planned',
    sourceType: 'ai_review',
    aiStatus: 'pending',
    content: [
      raw.timingReason ? `时机判断：${raw.timingReason}` : '',
      Array.isArray(raw.outline) && raw.outline.length ? '随访要点：\n' + raw.outline.map((o, i) => `${i + 1}. ${o}`).join('\n') : '',
    ].filter(Boolean).join('\n\n'),
  });
}

module.exports = { runMonthlyFollowUpReview };
