const Message = require('../models/Message');
const { chat } = require('./ai');

let _ssePublish = null;
function ssePublish(...args) { if (!_ssePublish) { try { _ssePublish = require('../routes/messages').ssePublish; } catch {} } _ssePublish?.(...args); }

// AI消息兜底回复：用户给家庭医生/营养师/健管师留言后，若5分钟内医护未读，
// 由AI先生成一条初步回复安抚用户，明确不涉及诊断/治疗建议；医护后续看到仍可正常人工回复，
// 用户会在同一对话线程里看到AI回复+医护回复两条，不互相覆盖。

const WAIT_MS = 5 * 60 * 1000;
const TITLE_MAP = { doctor: '家庭医师', nutritionist: '营养师', manager: '健管师' };
const SENDER_MAP = { doctor: 'AI健康助手（代家庭医师）', nutritionist: 'AI健康助手（代营养师）', manager: 'AI健康助手（代健管师）' };

const SYSTEM_PROMPT = `你是嘉医汇健康管理平台的AI助手，正在代替繁忙的医护人员对用户留言做一个简短的初步回应。

要求：
1. 用中文，语气温和有耐心
2. 只做安抚、告知"已收到、稍后由专属医护人员跟进"，可以给通用的生活方式/健康科普类建议
3. 严禁给出任何具体诊断结论、用药调整、检查建议等医疗决策类内容
4. 控制在100字以内
5. 结尾固定加："以上为AI初步回复，仅供参考，不构成医疗诊断或建议，您的专属医护人员会尽快跟进。"`;

async function scanAndReplyPendingMessages() {
  const cutoff = new Date(Date.now() - WAIT_MS);

  // 找出超过等待时长仍未被医护已读、且尚未有AI兜底回复的用户留言
  const pending = await Message.find({
    type: 'user',
    staffReadAt: null,
    createdAt: { $lte: cutoff },
    conversationId: { $ne: null },
  }).select('conversationId recipient content user').lean();

  if (!pending.length) return;

  // 按会话去重：同一会话已有AI兜底回复的不重复触发
  const convIds = [...new Set(pending.map(m => m.conversationId))];
  const alreadyReplied = await Message.find({
    conversationId: { $in: convIds }, isAI: true,
  }).select('conversationId').lean();
  const repliedSet = new Set(alreadyReplied.map(m => m.conversationId));

  let count = 0;
  for (const msg of pending) {
    if (repliedSet.has(msg.conversationId)) continue;
    repliedSet.add(msg.conversationId); // 同批次内同会话只回一次

    try {
      const replyText = await chat(
        [{ role: 'user', content: msg.content }],
        { systemPrompt: SYSTEM_PROMPT, maxTokens: 300 }
      );
      const aiMsg = await Message.create({
        user: msg.user,
        type: msg.recipient,
        sender: SENDER_MAP[msg.recipient] || 'AI健康助手',
        title: `${TITLE_MAP[msg.recipient] || ''}暂未回复，AI先为您解答`,
        content: replyText,
        unread: true,
        conversationId: msg.conversationId,
        isAI: true,
      });
      ssePublish(msg.conversationId, { type: 'message', data: aiMsg });
      count++;
    } catch (e) {
      console.error('[ai-msg-fallback] 会话 ' + msg.conversationId + ' AI兜底回复失败', e.message);
    }
  }
  if (count > 0) console.log(`[ai-msg-fallback] 已为 ${count} 个会话生成AI兜底回复`);
}

// 每分钟扫描一次，供 index.js 在服务启动时调用
function startAIMessageFallbackScheduler() {
  setInterval(() => {
    scanAndReplyPendingMessages().catch(e => console.error('[ai-msg-fallback] 定时扫描失败', e.message));
  }, 60 * 1000);
}

module.exports = { scanAndReplyPendingMessages, startAIMessageFallbackScheduler };
