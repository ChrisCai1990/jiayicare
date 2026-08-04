const express = require('express');
const auth = require('../middleware/auth');
const { chat } = require('../utils/ai');
const ChatLog = require('../models/ChatLog');
const HealthRecord = require('../models/HealthRecord');
const User = require('../models/User');
const Message = require('../models/Message');
const router = express.Router();

const BASE_SYSTEM = `你是「小嘉」，嘉医汇健康管理平台的AI健康规划师。你的角色类似服务顾问：帮助会员梳理健康管理需求、明确阶段目标、介绍平台服务内容、规划服务步骤，并在需要时转接人工健康管理专员。

回答要求：
1. 使用中文，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 先询问会员希望改善的问题、期望目标、可投入时间和服务偏好，再给出健康管理需求清单与建议服务路径
4. 可以介绍健康档案整理、体检信息整理、生活方式管理、健康提醒、复查提醒和就医协助，但不得把某项服务描述为医疗诊断或治疗
5. 不提供疾病诊断、治疗方案、处方、线上复诊、检查开单、药品推荐、停换药或剂量调整，不解读症状来判断疾病
6. 遇到医疗问题，简短说明超出服务范围，建议前往正规医疗机构；遇到胸痛、呼吸困难、意识障碍等紧急情况，提示立即拨打120
7. 不捏造会员信息，不制造焦虑，不承诺疗效，不使用“治愈”“治疗”“保证改善”等表述
8. 服务推荐必须说明推荐理由，由会员自主选择，不得诱导购买高价套餐
9. 每次回答末尾加：「小嘉仅提供健康管理需求梳理与服务规划，不提供诊断、治疗或处方。」`;

// 从AI健康分析/风险评估结果中摘取要点，供对话时结合上下文回答（只取已审核可见的版本，与会员当前实际看到的一致）
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
  return lines.length ? `\n会员健康管理资料摘要（仅用于梳理服务需求，不得据此诊断或治疗）：\n${lines.join('\n')}` : '';
}

// 意图识别（关键词规则，快速无额外API调用）
function detectIntent(text) {
  const t = text.toLowerCase();
  const serviceKw = ['预约', '体检', '服务包', '套餐', '怎么买', '购买', '流程', '开通', '续费', '多少钱', '价格', '规划', '需求'];
  const dataKw = ['我的', '最新', '上次', '多少', '几点', '血压', '血糖', '心率', '体重', '睡眠', '查一下', '看看'];
  const outKw = ['处方', '手术', '住院', '诊断', '开药', '什么病', '怎么治疗', '吃什么药', '停药', '换药', '剂量', '问诊', '开单'];

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

  // AI健康规划师仅承担需求梳理与服务规划；是否配有专业团队都不改变非医疗边界。
  const me = await User.findById(userId).select('assignedFamilyDoctor aiHealthSummary aiRiskAssessment');
  const hasDoctor = !!me?.assignedFamilyDoctor;

  const DAILY_LIMIT_NO_DOCTOR = 5;
  if (!hasDoctor) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayCount = await ChatLog.countDocuments({ user: userId, createdAt: { $gte: todayStart } });
    if (todayCount >= DAILY_LIMIT_NO_DOCTOR) {
      return res.status(429).json({ success: false, message: `今日AI规划次数已达上限（${DAILY_LIMIT_NO_DOCTOR}次），请明天再来，或联系健康管理专员继续梳理需求` });
    }
  }

  // 意图识别
  const intent = detectIntent(lastUserMsg);

  // 超出范围直接返回
  if (intent === 'out_of_scope') {
    const reply = '这个问题属于医疗诊疗范畴，小嘉不能提供判断或建议。请前往正规医疗机构咨询执业医师；如情况紧急，请立即拨打120。小嘉仅提供健康管理需求梳理与服务规划，不提供诊断、治疗或处方。';
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: reply });
    return res.json({ success: true, data: { content: reply, intent, logId: log._id } });
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

  const scopeNotice = `\n【角色边界】无论会员是否配有专业服务团队，你都只能进行健康管理需求梳理、服务规划与平台服务介绍。健康资料只能用于判断可能需要哪类非医疗健康管理支持，不能用于疾病判断、诊疗建议或用药指导。`;

  const systemPrompt = [
    BASE_SYSTEM,
    scopeNotice,
    userContext ? `\n用户基本信息：${userContext}` : '',
    buildHealthInsightContext(me),
    dataContext,
  ].join('');

  // 格式化历史消息：最近10条，且只取24小时内的（避免几天前的话题被当作当前场景误关联）。
  // 每条历史消息前标注日期，让模型自己判断是否与当前问题相关，而不是靠"条数"这种和时间无关的截断。
  const HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const chatMessages = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .filter(m => !m.time || now - new Date(m.time).getTime() <= HISTORY_WINDOW_MS)
    .slice(-10)
    .map(m => {
      const dateTag = m.time ? `[${new Date(m.time).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}] ` : '';
      return { role: m.role, content: dateTag + String(m.content) };
    });

  if (!chatMessages.length || chatMessages[chatMessages.length - 1].role !== 'user') {
    return res.status(400).json({ success: false, message: '消息格式错误' });
  }

  try {
    const replyText = await chat(chatMessages, { systemPrompt, maxTokens: 600 });
    const durationMs = Date.now() - t0;

    // 需要拿到 _id 返回给前端才能支持"当场撤回"（撤回按 logId 定位 ChatLog 记录）
    const log = await ChatLog.create({ user: userId, intent, userMessage: lastUserMsg, aiReply: replyText, durationMs });

    res.json({ success: true, data: { content: replyText, intent, logId: log._id } });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ success: false, message: `AI响应失败，请稍后重试。（${err.message}）` });
  }
});

// POST /api/chat/transfer — 转人工，落库为待办，健管专员在 ai-todos 待审核列表可见（transfer_human 场景），
// 同时把最近几轮AI聊天摘要注入到健管的人工对话（Message，manager频道），避免会员需要重新描述一遍问题
router.post('/transfer', auth, async (req, res) => {
  const { lastMessage = '' } = req.body;
  try {
    await ChatLog.create({
      user: req.user._id,
      role: 'transfer',
      intent: 'out_of_scope',
      userMessage: lastMessage,
      aiReply: '',
      transferred: true,
      resolved: false,
    });

    // 取最近5轮AI对话组装摘要，作为system消息插入manager会话，健管打开"发消息"对话框即可看到上下文
    const recentLogs = await ChatLog.find({ user: req.user._id, role: { $ne: 'transfer' } })
      .sort({ createdAt: -1 }).limit(5).lean();
    const historyLines = recentLogs.reverse()
      .map(l => `会员：${l.userMessage}\n小嘉：${l.aiReply}`)
      .join('\n\n');
    await Message.create({
      user: req.user._id,
      type: 'system',
      sender: '系统',
      title: 'AI对话转人工',
      content: historyLines
        ? `会员从AI健康规划师转来，以下是此前需求梳理摘要：\n\n${historyLines}\n\n会员当前需求：${lastMessage}`
        : `会员从AI健康规划师转来人工服务规划：${lastMessage}`,
      conversationId: `${req.user._id}_manager`,
    });

    const hasManager = !!(await User.findById(req.user._id).select('assignedHealthManager').lean())?.assignedHealthManager;
    res.json({
      success: true,
      message: hasManager
        ? '已通知健管专员，稍后将有专员与您联系。'
        : '已记录您的咨询，客服会尽快为您安排专员对接。',
    });
  } catch (err) {
    console.error('Chat transfer error:', err.message);
    res.status(500).json({ success: false, message: '转接失败，请稍后重试或直接拨打客服电话。' });
  }
});

// GET /api/chat/logs/:userId — 查看自己的对话记录（只能查自己）
// 医护端查看会员记录请走 staff 路由（待接入）
router.get('/logs/:userId', auth, async (req, res) => {
  if (req.user._id.toString() !== req.params.userId) {
    return res.status(403).json({ success: false, message: '无权访问' });
  }
  try {
    const logs = await ChatLog.find({ user: req.params.userId, recalled: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/chat/logs/:id/recall — 撤回一轮问答（仅本人，2分钟内可撤回）
const RECALL_WINDOW_MS = 2 * 60 * 1000;
router.patch('/logs/:id/recall', auth, async (req, res) => {
  try {
    const log = await ChatLog.findById(req.params.id);
    if (!log) return res.status(404).json({ success: false, message: '记录不存在' });
    if (log.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: '无权操作' });
    }
    if (log.recalled) return res.json({ success: true, message: '已撤回' });
    if (Date.now() - log.createdAt.getTime() > RECALL_WINDOW_MS) {
      return res.status(400).json({ success: false, message: '超过2分钟，无法撤回' });
    }
    log.recalled = true;
    log.recalledAt = new Date();
    await log.save();
    res.json({ success: true, message: '已撤回' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
