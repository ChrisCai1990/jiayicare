const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const ChatLog = require('../models/ChatLog');
const ChatConversationState = require('../models/ChatConversationState');
const { isHumanPresent } = require('../utils/chatPresence');
const PushRecord = require('../models/PushRecord');
const { QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { uploadBase64, signStoredUrl } = require('../utils/oss');
const { conversationRoleKeys, getConversationRole } = require('../utils/conversationRoles');
const router = express.Router();

function withSignedMessageMedia(message) {
  const obj = message.toObject ? message.toObject() : { ...message };
  const urls = obj.imageUrls?.length ? obj.imageUrls : (obj.imageUrl ? [obj.imageUrl] : []);
  const signedUrls = urls.map(url => signStoredUrl(url));
  obj.imageUrls = signedUrls;
  obj.imageUrl = signedUrls[0] || '';
  obj.audioUrl = obj.audioUrl ? signStoredUrl(obj.audioUrl) : '';
  return obj;
}

// 获取未读消息数（含推送记录，用于导航角标）
router.get('/unread-count', auth, async (req, res) => {
  const [unreadMessages, unreadPushes, latestMessage] = await Promise.all([
    Message.find({ user: req.user._id, unread: true, recalled: { $ne: true } }).select('type questionnaireId').lean(),
    PushRecord.find({ patientId: req.user._id, readAt: null })
      .select('type questionnaireId sourceOrderId').lean(),
    Message.findOne({ user: req.user._id, unread: true, recalled: { $ne: true } })
      .sort({ createdAt: -1 }).select('sender type title content createdAt').lean(),
  ]);
  const questionnairePushes = unreadPushes.filter(item => item.type === 'questionnaire' && item.questionnaireId);
  const responses = questionnairePushes.length ? await QuestionnaireResponse.find({
    user: req.user._id,
    $or: [
      { pushRecordId: { $in: questionnairePushes.map(item => item._id) } },
      { pushRecordId: null, questionnaire: { $in: questionnairePushes.map(item => item.questionnaireId) } },
    ],
  }).select('pushRecordId questionnaire').lean() : [];
  const answeredPushIds = new Set(responses.filter(item => item.pushRecordId).map(item => String(item.pushRecordId)));
  const legacyAnsweredQuestionnaireIds = new Set(responses.filter(item => !item.pushRecordId).map(item => String(item.questionnaire)));
  const pushCount = unreadPushes.filter(item => item.type !== 'questionnaire'
    || (!answeredPushIds.has(String(item._id))
      && (item.sourceOrderId || !legacyAnsweredQuestionnaireIds.has(String(item.questionnaireId))))).length;
  const pendingQuestionnaireIds = new Set(questionnairePushes.filter(item => !answeredPushIds.has(String(item._id))
    && (item.sourceOrderId || !legacyAnsweredQuestionnaireIds.has(String(item.questionnaireId))))
    .map(item => String(item.questionnaireId)));
  const msgCount = unreadMessages.filter(item => item.type !== 'questionnaire'
    || pendingQuestionnaireIds.has(String(item.questionnaireId))).length;
  res.json({ success: true, count: msgCount + pushCount, latestMessage });
});

// 获取消息列表
router.get('/', auth, async (req, res) => {
  const { type } = req.query;
  const query = { user: req.user._id, recalled: { $ne: true } };
  if (type) query.type = type;
  const messages = await Message.find(query).sort({ createdAt: -1 }).limit(50);
  const unreadCount = await Message.countDocuments({ user: req.user._id, unread: true, recalled: { $ne: true } });
  res.json({ success: true, data: messages.map(withSignedMessageMedia), unreadCount });
});

// 获取与某个角色的完整对话线程
router.get('/thread/:role', auth, async (req, res) => {
  const { role } = req.params;
  if (!conversationRoleKeys.includes(role)) return res.status(400).json({ success: false, message: '无效角色' });
  const conversationId = `${req.user._id}_${role}`;
  const [newestMessages, plannerLogs, state] = await Promise.all([
    Message.find({
      user: req.user._id,
      recalled: { $ne: true },
      $and: [
        { $or: [{ conversationId }, { type: role, conversationId: null }] },
        { $or: [{ aiGenerated: { $ne: true } }, { aiReviewStatus: { $in: ['', 'approved'] } }] },
      ],
    }).sort({ createdAt: -1 }).limit(100),
    role === 'planner'
      ? ChatLog.find({ user: req.user._id, recalled: { $ne: true } }).sort({ createdAt: -1 }).limit(50).lean()
      : [],
    ChatConversationState.findOne({ conversationId }).select('humanActive takenOverAt').lean(),
  ]);
  const messages = newestMessages.map(withSignedMessageMedia);
  // 旧版健康规划师曾使用 ChatLog。只在读取时并入统一线程；今后的消息均写入 Message。
  if (role === 'planner') {
    plannerLogs.forEach((log) => {
      if (log.userMessage) messages.push({
        _id: `chat-user:${log._id}`, user: log.user, type: 'user', sender: '客户',
        content: log.userMessage, imageUrl: signStoredUrl(log.imageUrl || ''), audioUrl: signStoredUrl(log.audioUrl || ''),
        audioDuration: log.audioDuration || 0, audioTranscript: log.audioTranscript || '', createdAt: log.createdAt,
      });
      if (log.aiReply) messages.push({
        _id: `chat-ai:${log._id}`, user: log.user, type: 'planner', sender: 'AI健康规划师',
        content: log.aiReply, isAI: true, createdAt: log.createdAt,
      });
    });
  }
  messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  // 标记所有未读为已读
  await Message.updateMany({ conversationId, user: req.user._id, type: { $ne: 'user' }, unread: true }, { unread: false, readAt: new Date() });
  res.json({
    success: true,
    data: messages.slice(-100),
    conversationId,
    humanActive: isHumanPresent(state),
    takenOverAt: state?.takenOverAt || null,
  });
});

router.post('/nutrition-analysis', auth, async (req, res) => {
  const content = String(req.body?.content || '').trim();
  if (!content) return res.status(400).json({ success: false, message: 'AI分析内容不能为空' });
  const conversationId = `${req.user._id}_nutritionist`;
  const aiMsg = await Message.create({
    user: req.user._id, type: 'nutritionist', sender: 'AI营养分析', title: 'AI生成 · 待营养师审核',
    content, unread: false, conversationId, isAI: true, aiGenerated: true, aiReviewStatus: 'pending',
  });
  ssePublish(conversationId, { type: 'message', data: aiMsg });
  res.json({ success: true, data: aiMsg });
});

// 撤回一条消息（仅本人发送的消息，2分钟内可撤回，与AI助手频道 chat.js 的撤回规则一致）
const RECALL_WINDOW_MS = 2 * 60 * 1000;
router.patch('/:id/recall', auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.id);
    if (!msg) return res.status(404).json({ success: false, message: '消息不存在' });
    if (msg.user.toString() !== req.user._id.toString() || msg.type !== 'user') {
      return res.status(403).json({ success: false, message: '只能撤回自己发送的消息' });
    }
    if (msg.recalled) return res.json({ success: true, message: '已撤回' });
    if (Date.now() - msg.createdAt.getTime() > RECALL_WINDOW_MS) {
      return res.status(400).json({ success: false, message: '超过2分钟，无法撤回' });
    }
    msg.recalled = true;
    msg.recalledAt = new Date();
    await msg.save();
    if (msg.conversationId) ssePublish(msg.conversationId, { type: 'recall', messageId: String(msg._id) });
    res.json({ success: true, message: '已撤回' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 标记已读
router.patch('/:id/read', auth, async (req, res) => {
  await Message.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { unread: false, readAt: new Date() }
  );
  res.json({ success: true });
});

// 全部已读
router.patch('/read-all', auth, async (req, res) => {
  await Message.updateMany({ user: req.user._id, unread: true }, { unread: false, readAt: new Date() });
  res.json({ success: true, message: '全部已读' });
});

// 批量标记消息中心当前实际展示的通知为已读。客户端传入明确 ID，避免打开
// “系统通知”时误清仍待填写的问卷或其他会话消息。
router.patch('/read-batch', auth, async (req, res) => {
  const messageIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds.slice(0, 100) : [];
  const pushRecordIds = Array.isArray(req.body?.pushRecordIds) ? req.body.pushRecordIds.slice(0, 100) : [];
  const readAt = new Date();
  await Promise.all([
    messageIds.length
      ? Message.updateMany({ _id: { $in: messageIds }, user: req.user._id, unread: true }, { unread: false, readAt })
      : Promise.resolve(),
    pushRecordIds.length
      ? PushRecord.updateMany({ _id: { $in: pushRecordIds }, patientId: req.user._id, readAt: null }, { readAt })
      : Promise.resolve(),
  ]);
  res.json({ success: true });
});

// 用户发送消息（给健康顾问/营养师/健管专员/就医专员）
router.post('/', auth, async (req, res) => {
  try {
    const { to, content = '', imageUrl = '', image = '', images = [], audio = null, mimeType = 'image/jpeg', aiAnalysis = '', suppressAI = false } = req.body;
    if (!content?.trim() && !imageUrl && !image && !images.length && !audio?.data) {
      return res.status(400).json({ success: false, message: '消息内容不能为空' });
    }
    const roleConfig = getConversationRole(to);
    if (!roleConfig) {
      return res.status(400).json({ success: false, message: '收件人无效' });
    }

    // 检查需专属分配的岗位是否已分配（re-fetch确保最新状态）
    if (roleConfig.assignedField) {
      const User = require('../models/User');
      const freshUser = await User.findById(req.user._id).select(roleConfig.assignedField);
      const assigned = freshUser?.[roleConfig.assignedField];
      if (!assigned) {
        return res.status(400).json({ success: false, message: `暂未分配${roleConfig.label}，请联系健管专员` });
      }
    }

    const senderName = req.user.name || req.user.phone;
    const conversationId = `${req.user._id}_${to}`;
    let storedImageUrl = String(imageUrl || '');
    const storedImageUrls = [];
    if (image) {
      const uploaded = await uploadBase64(image, mimeType, 'messages');
      storedImageUrl = uploaded.url;
      storedImageUrls.push(uploaded.url);
    }
    for (const item of images.slice(0, 9)) {
      if (!item?.data) continue;
      const uploaded = await uploadBase64(item.data, item.mimeType || 'image/jpeg', 'messages');
      storedImageUrls.push(uploaded.url);
    }
    let audioUrl = '';
    let audioMimeType = '';
    let audioDuration = 0;
    if (audio?.data) {
      audioMimeType = String(audio.mimeType || 'audio/mpeg').toLowerCase();
      if (!['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'].includes(audioMimeType)) {
        return res.status(400).json({ success: false, message: '不支持的语音格式' });
      }
      if (String(audio.data).length > 12 * 1024 * 1024) return res.status(413).json({ success: false, message: '语音文件过大' });
      audioDuration = Math.max(1, Math.min(60, Number(audio.duration) || 1));
      audioUrl = (await uploadBase64(audio.data, audioMimeType, 'messages/audio')).url;
    }
    const msg = await Message.create({
      user:    req.user._id,
      type:    'user',
      sender:  senderName,
      title:   `用户留言 → ${roleConfig.label}`,
      content: content.trim() || '[语音消息]',
      imageUrl: storedImageUrl,
      imageUrls: storedImageUrls,
      audioUrl, audioDuration, audioMimeType,
      unread:  false,
      recipient: to,
      conversationId,
    });

    const responseMessage = withSignedMessageMedia(msg);
    ssePublish(conversationId, { type: 'message', data: responseMessage });
    console.log(`✉️  用户留言 [${senderName}] → ${to}: ${content.trim()}`);
    res.json({ success: true, data: responseMessage, message: '消息已发送' });

    // 先让客户端立即拿到已发送的语音气泡，再在响应后完成转写；避免识别耗时或短语音无结果
    // 被用户误认为“发送失败”。转写完成后通过轮询/SSE补到同一条消息，并供AI理解。
    if (audio?.data) {
      try {
        const audioTranscript = await require('../utils/asr').transcribeBase64(audio.data, audioMimeType);
        if (audioTranscript) {
          msg.audioTranscript = audioTranscript;
          await Message.updateOne({ _id: msg._id }, { $set: { audioTranscript } });
          ssePublish(conversationId, { type: 'message-update', data: withSignedMessageMedia(msg) });
        }
      } catch (error) {
        console.warn(`[message-asr] ${conversationId} 语音转写失败，将使用原语音兜底: ${error.message}`);
      }
    }

    if (to === 'nutritionist' && aiAnalysis?.trim()) {
      const aiMsg = await Message.create({
        user: req.user._id, type: 'nutritionist', sender: 'AI营养初评',
        title: 'AI生成 · 饮食照片初步分析', content: aiAnalysis.trim(), unread: true,
        conversationId, isAI: true, aiGenerated: true, aiReviewStatus: 'pending',
      });
      ssePublish(conversationId, { type: 'message', data: aiMsg });
      require('../utils/aiMessageFallback').replyWithAI({
        userId: req.user._id, recipient: to, content: content.trim() || '用户上传了饮食图片，请结合会话进行沟通', conversationId,
      });
      return;
    }
    if (to === 'nutritionist') {
      require('../utils/aiMessageFallback').replyWithAI({
        userId: req.user._id, recipient: to, content: content.trim() || (audioUrl ? '用户发来一条语音消息，请温和确认收到并请其在方便时补充文字重点' : '用户上传了健康记录图片'), conversationId,
      });
      return;
    }
    // 就医专员频道只做真人沟通，不生成可能被误认为就医建议的 AI 兜底回复。
    if (suppressAI || !roleConfig.aiEnabled) return;

    // AI立即先回一句安抚（不阻塞响应），医护看到后仍可正常人工回复追加
    require('../utils/aiMessageFallback').replyWithAI({
      userId: req.user._id, recipient: to, content: content.trim() || '用户发来一条语音消息，请温和确认收到并请其在方便时补充文字重点', conversationId,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '发送失败', error: err.message });
  }
});

// SSE 客户端注册表：conversationId → Set<res>
const sseClients = new Map();

function ssePublish(conversationId, data) {
  const clients = sseClients.get(conversationId);
  if (!clients) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try { res.write(payload); } catch {}
  }
}

// 对外暴露，供 staff 路由调用
module.exports.ssePublish = ssePublish;

// SSE 长连接：用户订阅某会话的实时消息
router.get('/stream/:role', auth, (req, res) => {
  const { role } = req.params;
  const conversationId = `${req.user._id}_${role}`;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(': connected\n\n');

  if (!sseClients.has(conversationId)) sseClients.set(conversationId, new Set());
  sseClients.get(conversationId).add(res);

  const heartbeat = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.get(conversationId)?.delete(res);
  });
});

// staff 路由需要时调用 ssePublish，这里也挂一个内部用的辅助
router.ssePublish = ssePublish;

module.exports = router;
