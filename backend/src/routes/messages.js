const express = require('express');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const PushRecord = require('../models/PushRecord');
const { uploadBase64 } = require('../utils/oss');
const router = express.Router();

// 获取未读消息数（含推送记录，用于导航角标）
router.get('/unread-count', auth, async (req, res) => {
  const [msgCount, pushCount] = await Promise.all([
    Message.countDocuments({ user: req.user._id, unread: true, recalled: { $ne: true } }),
    PushRecord.countDocuments({ patientId: req.user._id, readAt: null }),
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
  res.json({ success: true, data: messages, unreadCount });
});

// 获取与某个角色的完整对话线程
router.get('/thread/:role', auth, async (req, res) => {
  const { role } = req.params;
  const VALID = ['doctor', 'nutritionist', 'manager'];
  if (!VALID.includes(role)) return res.status(400).json({ success: false, message: '无效角色' });
  const conversationId = `${req.user._id}_${role}`;
  const messages = await Message.find({ conversationId, recalled: { $ne: true } }).sort({ createdAt: 1 }).limit(100);
  // 标记所有未读为已读
  await Message.updateMany({ conversationId, user: req.user._id, type: { $ne: 'user' }, unread: true }, { unread: false, readAt: new Date() });
  res.json({ success: true, data: messages, conversationId });
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
    const { to, content, imageUrl = '', image = '', mimeType = 'image/jpeg', aiAnalysis = '', suppressAI = false } = req.body;
    if (!content?.trim() && !imageUrl && !image) {
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
    if (image) {
      const uploaded = await uploadBase64(image, mimeType, 'messages');
      storedImageUrl = uploaded.url;
    }
    const msg = await Message.create({
      user:    req.user._id,
      type:    'user',
      sender:  senderName,
      title:   `用户留言 → ${TITLE_MAP[to]}`,
      content: content.trim(),
      imageUrl: storedImageUrl,
      unread:  false,
      recipient: to,
      conversationId,
    });

    ssePublish(conversationId, { type: 'message', data: msg });
    console.log(`✉️  用户留言 [${senderName}] → ${to}: ${content.trim()}`);
    res.json({ success: true, data: msg, message: '消息已发送' });

    if (to === 'nutritionist' && aiAnalysis?.trim()) {
      const aiMsg = await Message.create({
        user: req.user._id, type: 'nutritionist', sender: 'AI营养初评',
        title: 'AI生成 · 饮食照片初步分析', content: aiAnalysis.trim(), unread: true,
        conversationId, isAI: true, aiGenerated: true,
      });
      ssePublish(conversationId, { type: 'message', data: aiMsg });
      return;
    }
    if (suppressAI || to === 'nutritionist') return;

    // AI立即先回一句安抚（不阻塞响应），医护看到后仍可正常人工回复追加
    require('../utils/aiMessageFallback').replyWithAI({
      userId: req.user._id, recipient: to, content: content.trim(), conversationId,
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
