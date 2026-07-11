const Message = require('../models/Message');
const { chat } = require('./ai');

let _ssePublish = null;
function ssePublish(...args) { if (!_ssePublish) { try { _ssePublish = require('../routes/messages').ssePublish; } catch {} } _ssePublish?.(...args); }

// AI消息即时兜底回复：用户给家庭医生/营养师/健管师留言后，AI立即先回一句安抚，
// 明确不涉及诊断/治疗建议；医护看到后仍可正常人工回复追加，不覆盖AI这条。
const TITLE_MAP = { doctor: '家庭医师', nutritionist: '营养师', manager: '健管师' };
const SENDER_MAP = { doctor: 'AI健康助手（代家庭医师）', nutritionist: 'AI健康助手（代营养师）', manager: 'AI健康助手（代健管师）' };

const FULL_DISCLAIMER = '以上为AI初步回复，仅供参考，不构成医疗诊断或建议，您的专属医护人员会尽快跟进。';
const SHORT_DISCLAIMER = '（AI回复，仅供参考）';

const SYSTEM_PROMPT_FIRST = `你是嘉医汇健康管理平台的AI助手，正在代替繁忙的医护人员对用户留言做一个即时的初步回应，这是本次对话的第一条回复。

要求：
1. 用中文，语气自然温和、有真实的情感温度，像真人在关心地聊天，不要套话术、不要每句都重复"已收到留言"这类客套开场
2. 简要告知留言已收到、专属医护人员会尽快跟进，可结合用户内容给通用的生活方式/健康科普类建议
3. 用户表达情绪（开心、担心、感谢等）时要先回应情绪本身，再接话，让对方感觉到真的被关心，不要只回信息不回感情
4. 严禁给出任何具体诊断结论、用药调整、检查建议等医疗决策类内容
5. 控制在100字以内
6. 不要自己加免责声明，结尾会由系统统一附加`;

const SYSTEM_PROMPT_FOLLOWUP = `你是嘉医汇健康管理平台的AI助手，正在代替繁忙的医护人员回复用户在同一次对话里的后续消息。

要求：
1. 用中文，语气自然温和、有真实的情感温度，像真人在关心地聊天
2. 直接针对用户这句话的内容回应，不要再重复"留言已收到""专属医护人员会跟进"这类开场客套话（前面已经说过，重复会显得机械）
3. 用户表达情绪（开心、担心、感谢、抱怨等）时要先回应情绪本身，再接话，让对方感觉到真的被关心，不要只回信息不回感情
4. 严禁给出任何具体诊断结论、用药调整、检查建议等医疗决策类内容；如果用户问的问题超出你能安全回答的范围，坦诚说明需要等专属医护人员来解答
5. 控制在100字以内
6. 不要自己加免责声明，结尾会由系统统一附加`;

// 供 messages.js 在用户发送留言后异步调用，不阻塞发送响应
async function replyWithAI({ userId, recipient, content, conversationId }) {
  try {
    // 拉取该对话历史，让AI知道之前说过什么，避免每次都当新对话开场重复客套话
    const history = await Message.find({ conversationId })
      .sort({ createdAt: 1 })
      .limit(20)
      .select('type content')
      .lean();

    const isFirstAIReply = !history.some(m => m.type !== 'user');
    const disclaimer = isFirstAIReply ? FULL_DISCLAIMER : SHORT_DISCLAIMER;
    const systemPrompt = isFirstAIReply ? SYSTEM_PROMPT_FIRST : SYSTEM_PROMPT_FOLLOWUP;

    const chatMessages = history.map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.content.replace(FULL_DISCLAIMER, '').replace(SHORT_DISCLAIMER, '').trim(),
    }));
    chatMessages.push({ role: 'user', content });

    const replyText = await chat(chatMessages, { systemPrompt, maxTokens: 300 });
    const aiMsg = await Message.create({
      user: userId,
      type: recipient,
      sender: SENDER_MAP[recipient] || 'AI健康助手',
      title: `${TITLE_MAP[recipient] || ''}AI先为您解答`,
      content: `${replyText}\n${disclaimer}`,
      unread: true,
      conversationId,
      isAI: true,
    });
    ssePublish(conversationId, { type: 'message', data: aiMsg });
  } catch (e) {
    console.error('[ai-msg-fallback] 会话 ' + conversationId + ' AI兜底回复失败', e.message);
  }
}

module.exports = { replyWithAI };
