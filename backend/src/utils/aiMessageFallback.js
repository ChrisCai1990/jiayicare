const Message = require('../models/Message');
const User = require('../models/User');
const { chat } = require('./ai');

let _ssePublish = null;
function ssePublish(...args) { if (!_ssePublish) { try { _ssePublish = require('../routes/messages').ssePublish; } catch {} } _ssePublish?.(...args); }

// AI消息即时兜底回复：用户给健康顾问/营养师/健管专员留言后，AI立即先回一句安抚，
// 明确不涉及诊断/治疗建议；医护看到后仍可正常人工回复追加，不覆盖AI这条。
const TITLE_MAP = { doctor: '健康顾问', nutritionist: '营养师', manager: '健管专员' };
const SENDER_MAP = { doctor: 'AI健康助手（代健康顾问）', nutritionist: 'AI健康助手（代营养师）', manager: 'AI健康助手（代健管专员）' };

const FULL_DISCLAIMER = '';
const SHORT_DISCLAIMER = '';

// 得到客户称呼：优先用医护标注的 preferredTitle，否则按性别得体兜底（男→先生 / 女→女士 / 未知→姓名）
function resolveTitle(user) {
  if (user?.preferredTitle && user.preferredTitle.trim()) return user.preferredTitle.trim();
  const surname = (user?.name || '').trim().charAt(0);
  if (user?.gender === '男') return surname ? `${surname}先生` : (user.name || '您');
  if (user?.gender === '女') return surname ? `${surname}女士` : (user.name || '您');
  return user?.name || '您';
}

function buildSystemPrompt(isFirstAIReply, title) {
  return `你是嘉医汇健康管理平台中该服务人员自己的AI助理。真人目前可能正在接待其他客户，你先陪用户沟通；真人接入后你会退出。当前用户称呼："${title}"。

要求：
1. 开口称呼用户为"${title}"（自然融入，不用每句都喊，别生硬），用中文，语气自然温和、有真实的情感温度，像真人在关心地聊天
2. ${isFirstAIReply ? '这是本次对话的第一条回复，简要打个招呼即可，不用说"已收到留言/已记录/会跟进/会分析"这类话——用户每条消息健康顾问/营养师/健管专员本来就都会看到，不需要反复强调' : '直接针对用户这句话的内容自然接话，绝对不要出现"已记录""已为您记录""会结合情况分析""会及时跟进"这类重复的客套尾巴'}
3. 用户表达情绪（开心、担心、感谢、抱怨等）时要先回应情绪本身，再接话，让对方感觉真的被关心，不要只回信息不回感情
4. 你的重点是倾听、安抚和提供情绪价值，可给基础健康管理提醒；严禁诊断、治疗、用药调整或检查决策。紧急情况明确建议立即拨打120或直接电话联系服务人员
5. 控制在80字以内，简洁自然，不要写成客服话术
6. 不要安排其他健康管理师，也不要重复免责声明`;
}

// 供 messages.js 在用户发送留言后异步调用，不阻塞发送响应
async function replyWithAI({ userId, recipient, content, conversationId }) {
  try {
    const [history, user] = await Promise.all([
      Message.find({ conversationId }).sort({ createdAt: 1 }).limit(20).select('type content').lean(),
      User.findById(userId).select('name gender preferredTitle').lean(),
    ]);

    const isFirstAIReply = !history.some(m => m.type !== 'user');
    const disclaimer = isFirstAIReply ? FULL_DISCLAIMER : SHORT_DISCLAIMER;
    const title = resolveTitle(user);
    const systemPrompt = buildSystemPrompt(isFirstAIReply, title);

    const chatMessages = history.map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.content.replace(FULL_DISCLAIMER, '').replace(SHORT_DISCLAIMER, '').trim(),
    }));
    chatMessages.push({ role: 'user', content });

    const replyText = await chat(chatMessages, { systemPrompt, maxTokens: 300 });
    const aiMsg = await Message.create({
      user: userId,
      type: recipient,
      sender: SENDER_MAP[recipient] || 'AI健康规划师',
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
