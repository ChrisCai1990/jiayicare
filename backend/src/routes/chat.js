const express = require('express');
const auth = require('../middleware/auth');
const { chat } = require('../utils/ai');
const ChatLog = require('../models/ChatLog');
const HealthRecord = require('../models/HealthRecord');
const User = require('../models/User');
const router = express.Router();

const BASE_SYSTEM = `你是「小嘉」，嘉医汇健康管理平台的AI健康助手，主要服务于慢性病（高血压、糖尿病、心血管疾病等）患者。职责涵盖：日常健康科普、指标解读、用药提醒建议、服务套餐咨询、就医流程指导。

回答要求：
1. 使用中文，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 涉及药物剂量调整、诊断等，必须建议用户咨询专科医师
4. 每次回答末尾加：「本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。」
5. 不捏造数据，对不确定的信息说"建议咨询您的主治医生"`;

// 从AI健康分析/风险评估结果中摘取要点，供对话时结合上下文回答（只取已审核可见的版本，与患者当前实际看到的一致）
function buildHealthInsightContext(user) {
  const lines = [];
  const summary = user.aiHealthSummary || {};
  const byYear = summary.byYear || {};
  const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
  const latestYear = years[0];
  const latestEntry = latestYear ? byYear[latestYear] : null;
  if (latestEntry?.sections) {
    const s = latestEntry.sections;
    if (s.medical_priority?.items?.length) {
      lines.push(`【AI健康分析·${latestYear}年度·重点医疗问题】` + s.medical_priority.items.map(i => `${i.name}（${i.urgency}）：${i.action || ''}`).join('；'));
    }
    if (s.lifestyle_assessment?.summary) {
      lines.push(`【生活方式评估】${s.lifestyle_assessment.summary}`);
    }
  }
  const risk = user.aiRiskAssessment || {};
  if (risk.overallSummary) {
    lines.push(`【AI风险评估】整体风险等级：${risk.overallLevel || '未知'}；${risk.overallSummary}`);
  }
  return lines.length ? `\n患者健康分析要点（供回答时参考，不要直接照搬粘贴，需结合用户实际提问自然表达）：\n${lines.join('\n')}` : '';
}

// 意图识别（关键词规则，快速无额外API调用）
function detectIntent(text) {
  const t = text.toLowerCase();
  const serviceKw = ['预约', '体检', '服务包', '套餐', '怎么买', '购买', '流程', '开通', '续费', '多少钱', '价格'];
  const dataKw = ['我的', '最新', '上次', '多少', '几点', '血压', '血糖', '心率', '体重', '睡眠', '查一下', '看看'];
  const outKw = ['处方', '手术', '住院', '诊断', '开药'];

  if (outKw.some(k => t.includes(k))) return 'out_of_scope';
  if (dataKw.filter(k => t.includes(k)).length >= 2) return 'data';
  if (serviceKw.some(k => t.includes(k))) return 'service';
  return 'knowledge';
}

// 拉取用户最近健康数据摘要
async function getUserDataContext(userId) {
  try {
    const records = await HealthRecord.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const latest = {};
    records.forEach(r => {
      if (!latest[r.type]) latest[r.type] = r;
    });

    const lines = [];
    if (latest.bloodPressure) {
      const r = latest.bloodPressure;
      lines.push(`血压：${r.extra?.sys || ''}/${r.extra?.dia || ''}mmHg（${new Date(r.createdAt).toLocaleDateString('zh-CN')}）`);
    }
    if (latest.bloodSugar) lines.push(`血糖：${latest.bloodSugar.value}mmol/L`);
    if (latest.heartRate)  lines.push(`心率：${latest.heartRate.value}次/分`);
    if (latest.weight)     lines.push(`体重：${latest.weight.value}kg`);
    if (latest.sleep)      lines.push(`睡眠：${latest.sleep.value}小时`);

    return lines.length ? `\n用户最新健康数据：\n${lines.join('\n')}` : '';
  } catch {
    return '';
  }
}

// POST /api/chat — 主对话接口
router.post('/', auth, async (req, res) => {
  const { messages = [], userInfo = {} } = req.body;
  const userId = req.user._id;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const t0 = Date.now();

  if (!process.env.QWEN_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI服务暂未开通，请联系管理员配置。' });
  }

  // 一对一AI咨询仅面向已配备家庭医生团队的客户开放；无家庭医生的客户走AI自助分析（汇总/风险评估），不支持一对一咨询
  const me = await User.findById(userId).select('assignedFamilyDoctor aiHealthSummary aiRiskAssessment');
  if (!me?.assignedFamilyDoctor) {
    return res.status(403).json({ success: false, message: '暂未配备家庭医生团队，该服务暂不支持。您可以在"健康报告"中查看AI自助分析结果。' });
  }

  // 意图识别
  const intent = detectIntent(lastUserMsg);

  // 超出范围直接返回
  if (intent === 'out_of_scope') {
    const reply = '您的问题涉及专业诊疗范畴，AI助手无法提供此类建议。请联系您的主治医生或拨打急救电话。本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。';
    await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: reply });
    return res.json({ success: true, data: { content: reply, intent } });
  }

  // 数据查询类：附上健康数据
  let dataContext = '';
  if (intent === 'data') {
    dataContext = await getUserDataContext(userId);
  }

  // 拼接系统提示
  const userContext = [
    userInfo.name  && `姓名：${userInfo.name}`,
    userInfo.age   && `年龄：${userInfo.age}岁`,
    userInfo.gender && userInfo.gender !== '未知' && `性别：${userInfo.gender}`,
    userInfo.conditions && `既往病史：${userInfo.conditions}`,
    userInfo.medications && `用药：${userInfo.medications}`,
  ].filter(Boolean).join('，');

  const systemPrompt = [
    BASE_SYSTEM,
    userContext ? `\n用户基本信息：${userContext}` : '',
    buildHealthInsightContext(me),
    dataContext,
  ].join('');

  // 格式化历史消息（最近10条）
  const chatMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => ({ role: m.role, content: String(m.content) }));

  if (!chatMessages.length || chatMessages[chatMessages.length - 1].role !== 'user') {
    return res.status(400).json({ success: false, message: '消息格式错误' });
  }

  try {
    const replyText = await chat(chatMessages, { systemPrompt, maxTokens: 600 });
    const durationMs = Date.now() - t0;

    // 异步记录日志，不阻塞响应
    ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: replyText, durationMs }).catch(() => {});

    res.json({ success: true, data: { content: replyText, intent } });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, message: 'AI响应失败，请稍后重试。' });
  }
});

// POST /api/chat/transfer — 转人工
router.post('/transfer', auth, async (req, res) => {
  const { lastMessage = '' } = req.body;
  await ChatLog.create({
    user: req.user._id,
    role: 'transfer',
    intent: 'out_of_scope',
    userMessage: lastMessage,
    aiReply: '',
    transferred: true,
  }).catch(() => {});
  res.json({ success: true, message: '已通知健管专员，稍后将有专员与您联系。' });
});

// GET /api/chat/logs/:userId — 查看自己的对话记录（只能查自己）
// 医护端查看患者记录请走 staff 路由（待接入）
router.get('/logs/:userId', auth, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ success: false, message: '无权访问' });
  }
  try {
    const logs = await ChatLog.find({ user: req.params.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
