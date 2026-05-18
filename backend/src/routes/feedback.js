const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

// POST /api/feedback — 提交帮助反馈
router.post('/', auth, async (req, res) => {
  const { type = '意见建议', content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: '请填写反馈内容' });
  }

  // 记录到日志（生产环境可接入企业微信/飞书/邮件通知）
  console.log(`[Feedback] 用户 ${req.user._id} (${req.user.phone}) | 类型: ${type} | 内容: ${content.trim()}`);

  res.json({ success: true, message: '感谢您的反馈！我们会在 3 个工作日内处理。' });
});

module.exports = router;
