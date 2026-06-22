const express = require('express');
const auth = require('../middleware/auth');
const { chat } = require('../utils/ai');
const ChatLog = require('../models/ChatLog');
const HealthRecord = require('../models/HealthRecord');
const router = express.Router();

const ROLE_PROMPTS = {
  manager: '你是「嘉医汇」健康管理平台的健管专员AI助手。职责：日常健康科普、指标解读、用药提醒建议。',
  planner: '你是「嘉医汇」健康管理平台的健康规划师AI助手。职责：介绍服务包、健康方案设计、套餐咨询。',
  medical: '你是「嘉医汇」健康管理平台的就医专员AI助手。职责：就医流程指导、陪诊建议、分诊建议。',
};

const BASE_SYSTEM = `你是「嘉医汇」健康管理平台的AI健康助手，主要服务于慢性病（高血压、糖尿病、心血管疾病等）患者。

回答要求：
1. 使用中文，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 涉及药物剂量调整、诊断等，必须建议用户咨询专科医师
4. 每次回答末尾加：「本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。」
5. 不捏造数据，对不确定的信息说"建议咨询您的主治医生"`;

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
  const { messages = [], role = 'manager', userInfo = {} } = req.body;
  const userId = req.user._id;
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  const t0 = Date.now();

  if (!process.env.QWEN_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI服务暂未开通，请联系管理员配置。' });
  }

  // 意图识别
  const intent = detectIntent(lastUserMsg);

  // 超出范围直接返回
  if (intent === 'out_of_scope') {
    const reply = '您的问题涉及专业诊疗范畴，AI助手无法提供此类建议。请联系您的主治医生或拨打急救电话。本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。';
    await ChatLog.create({ user: userId, role, intent, userMessage: lastUserMsg, aiReply: reply });
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
    `\n当前角色：${ROLE_PROMPTS[role] || ROLE_PROMPTS.manager}`,
    userContext ? `\n用户基本信息：${userContext}` : '',
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
    ChatLog.create({ user: userId, role, intent, userMessage: lastUserMsg, aiReply: replyText, durationMs }).catch(() => {});

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

// GET /api/chat/logs — 医护端查看对话记录（staffAuth 在 staff 路由挂）
router.get('/logs/:userId', auth, async (req, res) => {
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
