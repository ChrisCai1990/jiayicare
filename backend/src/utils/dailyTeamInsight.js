const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const DailyTeamInsight = require('../models/DailyTeamInsight');

function toLocalDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 兜底文案：AI不可用或当日无数据时展示，不空白也不编造
const FALLBACK = {
  doctor: '暂无新的医疗风险',
  nutritionist: '暂无新的饮食建议',
  healthManager: '等待更新昨日健康数据',
  aiSummary: '数据较少，暂无明显趋势变化',
  todaySuggestion: '保持规律作息，坚持记录健康数据',
};

// 取某用户昨日（00:00-24:00，本地时区）的健康记录，按类型分组成便于喂给AI的文本
async function collectYesterdayData(userId, dateStr) {
  const dayStart = new Date(`${dateStr}T00:00:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999`);
  const records = await HealthRecord.find({
    user: userId, recordedAt: { $gte: dayStart, $lte: dayEnd },
  }).sort({ recordedAt: 1 }).lean();
  return records;
}

function formatRecordsForPrompt(records) {
  if (records.length === 0) return '（昨日无任何打卡记录）';
  return records.map(r => {
    if (r.type === 'bloodPressure') return `血压 ${r.value}mmHg（${r.status}）`;
    if (r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra) && Object.keys(r.extra).length) {
      return `${r.label} ${r.value}${r.unit || ''}（${r.status}）`;
    }
    return `${r.label}：${r.value}${r.unit || ''}${r.note ? '，备注：' + r.note : ''}`;
  }).join('\n');
}

// 核心生成逻辑：为单个用户生成昨日→今日的健康团队动态
async function generateDailyTeamInsight(userId, dateStr) {
  const user = await User.findById(userId).select('name gender chronicDiseases').lean();
  if (!user) return { status: 'skip', message: '用户不存在' };

  const records = await collectYesterdayData(userId, dateStr);
  const dataText = formatRecordsForPrompt(records);

  // 无任何数据时不调用AI，直接用兜底文案，节省成本
  if (records.length === 0) {
    return upsertInsight(userId, dateStr, { ...FALLBACK });
  }

  const prompt = `你是"金伊森"健康管理团队的助手，需要基于患者${user.name}昨日（${dateStr}）的健康打卡数据，
以家庭医生、营养师、健康管理师、AI健康分析四个视角分别给出简短反馈，供患者今天打开App时查看。

【患者慢病标签】${user.chronicDiseases?.join('、') || '无'}
【昨日打卡数据】
${dataText}

要求：
- 每项反馈基于实际数据，不要编造数据中没有的内容；若某类数据缺失，对应角度可如实说明"暂无相关数据"
- 语气专业、简洁、有温度，像真人专员说的话，不要出现"作为AI"字样
- doctor（家庭医生）：关注是否有医疗风险信号，没有则说明"暂无新的医疗风险"
- nutritionist（营养师）：基于饮食/血糖等数据给出次日饮食建议
- healthManager（健康管理师）：基于整体完成度说明跟进内容或待更新项
- aiSummary（AI健康分析）：一句话总结昨日数据反映出的身体状态变化
- todaySuggestion（今日建议）：一条具体可执行的行动建议（如具体时间/具体动作）

请严格按以下JSON格式输出（仅JSON，不要其他文字），每项20-40字：
{"doctor":"...","nutritionist":"...","healthManager":"...","aiSummary":"...","todaySuggestion":"..."}`;

  let parsed;
  try {
    const { chat } = require('./ai');
    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 600 });
    parsed = JSON.parse((text || '').replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error('[daily-team-insight] AI生成失败，用兜底模板：' + user.name, err.message);
    parsed = { ...FALLBACK };
  }

  return upsertInsight(userId, dateStr, {
    doctor: parsed.doctor || FALLBACK.doctor,
    nutritionist: parsed.nutritionist || FALLBACK.nutritionist,
    healthManager: parsed.healthManager || FALLBACK.healthManager,
    aiSummary: parsed.aiSummary || FALLBACK.aiSummary,
    todaySuggestion: parsed.todaySuggestion || FALLBACK.todaySuggestion,
  });
}

async function upsertInsight(userId, dateStr, fields) {
  const record = await DailyTeamInsight.findOneAndUpdate(
    { user: userId, date: dateStr },
    { $set: { ...fields, generatedAt: new Date() } },
    { upsert: true, new: true },
  );
  return { status: 'created', record };
}

module.exports = { generateDailyTeamInsight, toLocalDateStr, FALLBACK };
