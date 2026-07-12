const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const Feedback = require('../models/Feedback');

// POST /api/feedback — 用户提交帮助反馈
router.post('/', auth, async (req, res) => {
  const { type = '意见建议', content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '请填写反馈内容' });
  }

  await Feedback.create({
    user: req.user._id,
    tenantId: req.user.tenantId || null,
    type,
    content: content.trim(),
  });

  res.json({ success: true, message: '感谢您的反馈！我们会在 3 个工作日内处理。' });
});

// GET /api/feedback/mine — 用户端查看自己提交过的反馈及回复
router.get('/mine', auth, async (req, res) => {
  const list = await Feedback.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  res.json({ success: true, data: list });
});

// GET /api/feedback — 超管后台反馈列表（?status=pending|resolved）
router.get('/', adminAuth, async (req, res) => {
  const { status } = req.query;
  const filter = status ? { status } : {};
  const list = await Feedback.find(filter)
    .populate('user', 'name phone')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json({ success: true, data: list });
});

// PATCH /api/feedback/:id — 标记已处理 / 回复
router.patch('/:id', adminAuth, async (req, res) => {
  const { status, reply } = req.body;
  const update = {};
  if (status) update.status = status;
  if (reply !== undefined) {
    update.reply = reply;
    update.repliedBy = req.admin._id;
    update.repliedAt = new Date();
    update.status = 'resolved';
  }
  const fb = await Feedback.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!fb) return res.status(404).json({ success: false, message: '反馈不存在' });
  res.json({ success: true, data: fb });
});

module.exports = router;
