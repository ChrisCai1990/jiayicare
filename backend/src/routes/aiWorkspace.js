const express = require('express');
const staffAuth = require('../middleware/staffAuth');
const { chat } = require('../utils/ai');
const { withAiContext } = require('../utils/aiBudget');
const { isAiControlError } = require('../utils/aiBudgetPolicy');
const { withStaffService } = require('../utils/aiDataConsent');

const router = express.Router();
router.use(staffAuth);
const dailyCalls = new Map();
const DAILY_LIMIT = 30;
let activeDay = '';

function dailyKey(staff) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  if (today !== activeDay) { dailyCalls.clear(); activeDay = today; }
  return `${today}:${staff._id}`;
}

function callCount(staff) {
  return dailyCalls.get(dailyKey(staff)) || 0;
}

function enabledFor(staff) {
  if (process.env.AI_WORKSPACE_PILOT_ENABLED !== 'true') return false;
  const ids = String(process.env.AI_WORKSPACE_PILOT_STAFF_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  return ids.length ? ids.includes(String(staff._id)) : staff.role === 'superadmin';
}

function validMessages(messages) {
  return Array.isArray(messages) && messages.length > 0 && messages.length <= 13
    && messages.at(-1)?.role === 'user'
    && messages.every(m => m && ['user', 'assistant'].includes(m.role)
      && typeof m.content === 'string' && m.content.trim() && m.content.length <= 4000)
    && messages.reduce((sum, m) => sum + m.content.length, 0) <= 16000;
}

const prompts = {
  free: '你是嘉医汇医护团队的内部 AI 讨论助手。直接回答问题，区分事实、推测和待核实信息。不得假称已查阅客户档案、内部知识库或实时产品数据。涉及诊断、治疗、药物或紧急症状时，提醒由具备资质的人员根据实际资料判断。请用清晰自然的中文回答。',
  reply: '你是嘉医汇医护团队的内部回复草稿助手。用户只应输入模拟客户消息。起草自然、简洁、可供员工审核的中文回复；不得编造产品价格、服务承诺、预约结果、诊断或治疗建议。信息不足时列出需要人工核实的点。结尾另起一行写“员工核对：”并列出关键待核对事项。',
};

router.get('/status', (req, res) => {
  res.json({ success: true, data: { enabled: enabledFor(req.staff), ready: Boolean(process.env.QWEN_API_KEY), model: 'qwen-plus', knowledgeReady: false, dailyUsed: callCount(req.staff), dailyLimit: DAILY_LIMIT } });
});

router.post('/chat', async (req, res) => {
  if (!enabledFor(req.staff)) return res.status(403).json({ success: false, message: 'AI 工作台试用尚未对当前账号开放' });
  if (!process.env.QWEN_API_KEY) return res.status(503).json({ success: false, message: '通义千问尚未配置，请联系管理员' });
  const { mode, messages, webSearch } = req.body || {};
  if (!Object.hasOwn(prompts, mode) || !validMessages(messages)) return res.status(400).json({ success: false, message: '对话内容无效或过长；知识库模式暂未开放' });
  const key = dailyKey(req.staff);
  if (callCount(req.staff) >= DAILY_LIMIT) return res.status(429).json({ success: false, message: '今日 AI 工作台试用次数已用完，请明天再试' });
  dailyCalls.set(key, callCount(req.staff) + 1);
  try {
    const searchEnabled = mode === 'free' && webSearch === true;
    const today = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric' });
    const timePrompt = `当前北京时间是 ${today}。模型记忆可能过时；对日期、会议、政策、价格等有时效性的事实，不得仅凭训练记忆断言。${searchEnabled ? '本次已请求联网检索，请根据检索结果核对时间和事实；如果没有取得可靠结果，明确说无法确认。' : '本次未开启联网检索，无法核实近期事实时应明确说明。'}`;
    const content = await withStaffService(req.staff, () =>
      withAiContext({ actorId: String(req.staff._id), tenantId: String(req.staff.tenantId), business: 'other', stage: 'staff_ai_workspace_trial' }, () =>
        chat(messages.map(m => ({ role: m.role, content: m.content })), { provider: 'qwen', systemPrompt: `${prompts[mode]} ${timePrompt}`, webSearch: searchEnabled, maxTokens: 1200, temperature: 0.2, timeoutMs: 90000 })));
    if (!content) return res.status(502).json({ success: false, message: '通义千问没有返回内容，请稍后重试' });
    res.json({ success: true, data: { content, model: 'qwen-plus', webSearch: searchEnabled, dailyUsed: callCount(req.staff), dailyLimit: DAILY_LIMIT } });
  } catch (error) {
    res.status(isAiControlError(error) ? 429 : 502).json({ success: false, message: isAiControlError(error) ? error.message : '模型暂时无法回答，请稍后重试' });
  }
});

module.exports = router;
module.exports.enabledFor = enabledFor;
module.exports.validMessages = validMessages;
