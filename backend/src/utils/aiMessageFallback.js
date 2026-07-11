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

const SYSTEM_PROMPT = `你是嘉医汇健康管理平台的AI助手，正在代替繁忙的医护人员对用户留言做一个即时的初步回应。

要求：
1. 用中文，语气温和有耐心
2. 只做安抚、告知"已收到、专属医护人员会尽快跟进"，可以给通用的生活方式/健康科普类建议
3. 严禁给出任何具体诊断结论、用药调整、检查建议等医疗决策类内容
4. 控制在100字以内
5. 不要自己加免责声明，结尾会由系统统一附加`;

// 供 messages.js 在用户发送留言后异步调用，不阻塞发送响应
async function replyWithAI({ userId, recipient, content, conversationId }) {
  try {
    // 同一对话线程只在第一次AI回复时带完整免责声明，之后改用简短提示，避免每条都重复一长串
    const priorAIReply = await Message.exists({ conversationId, isAI: true });
    const disclaimer = priorAIReply ? SHORT_DISCLAIMER : FULL_DISCLAIMER;

    const replyText = await chat(
      [{ role: 'user', content }],
      { systemPrompt: SYSTEM_PROMPT, maxTokens: 300 }
    );
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
