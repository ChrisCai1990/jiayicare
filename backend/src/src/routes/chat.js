const express = require('express');
const auth = require('../middleware/auth');
const router = express.Router();

const ROLE_PROMPTS = {
  manager: '你是「嘉医汇」健康管理平台的健管专员AI助手。你的职责是：日常健康科普、指标解读、用药提醒建议。',
  planner: '你是「嘉医汇」健康管理平台的健康规划师AI助手。你的职责是：介绍服务包、健康方案设计、套餐咨询。',
  medical: '你是「嘉医汇」健康管理平台的就医专员AI助手。你的职责是：就医流程指导、陪诊建议、分诊建议。',
};

const BASE_SYSTEM = `
你是「嘉医汇」健康管理平台的AI健康助手，主要服务于慢性病（高血压、糖尿病、心血管疾病等）患者。

回答要求：
1. 使用中文回答，语气温和专业
2. 回答控制在200字以内，简洁精准
3. 涉及药物剂量调整、诊断等，必须建议用户咨询专科医生
4. 每次回答末尾加一句免责声明：「本回复由AI生成，仅供健康参考，不构成医疗诊断或建议。」
5. 不捏造数据，对不确定的信息说"建议咨询您的主治医生"
`.trim();

router.post('/', auth, async (req, res) => {
  const { messages = [], role = 'manager', userInfo = {} } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      success: false,
      message: 'AI服务暂未开通，请联系管理员配置。',
    });
  }

  // 用户背景信息
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
    userContext ? `\n用户信息：${userContext}` : '',
  ].join('\n');

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic.Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 过滤并格式化消息历史（最多保留最近10条对话）
    const chatMessages = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(m => ({ role: m.role, content: String(m.content) }));

    if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== 'user') {
      return res.status(400).json({ success: false, message: '消息格式错误' });
    }

    const response = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 600,
      system: systemPrompt,
      messages: chatMessages,
    });

    const text = response.content?.[0]?.text || '抱歉，AI暂时无法回复，请稍后再试。';
    res.json({ success: true, data: { content: text } });
  } catch (err) {
    console.error('Chat API error:', err.message);
    res.status(500).json({ success: false, message: 'AI响应失败，请稍后重试。' });
  }
});

module.exports = router;
