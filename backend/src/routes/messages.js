const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const ChatConversationState = require('../models/ChatConversationState');
const { isHumanPresent } = require('../utils/chatPresence');
const PushRecord = require('../models/PushRecord');
const { QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const { uploadBase64, signStoredUrl } = require('../utils/oss');
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
  const completedQuestionnaireIds = await QuestionnaireResponse.distinct('questionnaire', { user: req.user._id });
  const [msgCount, pushCount] = await Promise.all([
    Message.countDocuments({ user: req.user._id, unread: true, recalled: { $ne: true } }),
    PushRecord.countDocuments({
      patientId: req.user._id,
      readAt: null,
      $or: [
        { type: { $ne: 'questionnaire' } },
        { questionnaireId: { $nin: completedQuestionnaireIds } },
      ],
    }),
  ]);
  res.json({ success: true, count: msgCount + pushCount });
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
  const VALID = ['doctor', 'nutritionist', 'manager'];
  if (!VALID.includes(role)) return res.status(400).json({ success: false, message: '无效角色' });
  const conversationId = `${req.user._id}_${role}`;
  const [messages, state] = await Promise.all([
    Message.find({
      conversationId,
      recalled: { $ne: true },
      $or: [{ aiGenerated: { $ne: true } }, { aiReviewStatus: { $in: ['', 'approved'] } }],
    }).sort({ createdAt: 1 }).limit(100),
    ChatConversationState.findOne({ conversationId }).select('humanActive takenOverAt').lean(),
  ]);
  // 标记所有未读为已读
  await Message.updateMany({ conversationId, user: req.user._id, type: { $ne: 'user' }, unread: true }, { unread: false, readAt: new Date() });
  res.json({
    success: true,
    data: messages.map(withSignedMessageMedia),
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

// 用户发送消息（给健康顾问/营养师/健管专员）
router.post('/', auth, async (req, res) => {
  try {
    const { to, content = '', imageUrl = '', image = '', images = [], audio = null, mimeType = 'image/jpeg', aiAnalysis = '', suppressAI = false } = req.body;
    if (!content?.trim() && !imageUrl && !image && !images.length && !audio?.data) {
      return res.status(400).json({ success: false, message: '消息内容不能为空' });
    }
    const VALID_RECIPIENTS = ['doctor', 'nutritionist', 'manager'];
    if (!VALID_RECIPIENTS.includes(to)) {
      return res.status(400).json({ success: false, message: '收件人无效' });
    }

    // 检查营养师是否已分配（re-fetch确保最新状态）
    if (to === 'nutritionist') {
      const User = require('../models/User');
      const freshUser = await User.findById(req.user._id).select('assignedNutritionist');
      if (!freshUser?.assignedNutritionist) {
        return res.status(400).json({ success: false, message: '暂未分配营养师，请联系健管专员' });
      }
    }

    const TITLE_MAP = { doctor: '健康顾问', nutritionist: '营养师', manager: '健管专员' };
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
    let audioTranscript = '';
    if (audio?.data) {
      audioMimeType = String(audio.mimeType || 'audio/mpeg').toLowerCase();
      if (!['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'].includes(audioMimeType)) {
        return res.status(400).json({ success: false, message: '不支持的语音格式' });
      }
      if (String(audio.data).length > 12 * 1024 * 1024) return res.status(413).json({ success: false, message: '语音文件过大' });
      audioDuration = Math.max(1, Math.min(60, Number(audio.duration) || 1));
      audioUrl = (await uploadBase64(audio.data, audioMimeType, 'messages/audio')).url;
      try {
        audioTranscript = await require('../utils/asr').transcribeBase64(audio.data, audioMimeType);
      } catch (error) {
        console.warn(`[message-asr] ${conversationId} 语音转写失败，将使用文字补充兜底: ${error.message}`);
      }
    }
    const msg = await Message.create({
      user:    req.user._id,
      type:    'user',
      sender:  senderName,
      title:   `用户留言 → ${TITLE_MAP[to]}`,
      content: content.trim() || '[语音消息]',
      imageUrl: storedImageUrl,
      imageUrls: storedImageUrls,
      audioUrl, audioDuration, audioMimeType, audioTranscript,
      unread:  false,
      recipient: to,
      conversationId,
    });

    const responseMessage = withSignedMessageMedia(msg);
    ssePublish(conversationId, { type: 'message', data: responseMessage });
    console.log(`✉️  用户留言 [${senderName}] → ${to}: ${content.trim()}`);
    res.json({ success: true, data: responseMessage, message: '消息已发送' });

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
    if (suppressAI) return;

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
