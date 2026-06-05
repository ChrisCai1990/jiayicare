const express = require('express');
const ShareToken = require('../models/ShareToken');
const router = express.Router();

// GET /api/share/:token — 公开访问，无需登录
router.get('/:token', async (req, res) => {
  try {
    const share = await ShareToken.findOne({
      token: req.params.token,
      expiresAt: { $gt: new Date() },
    });

    if (!share) {
      return res.status(404).json({ success: false, message: '分享链接已失效或不存在' });
    }

    // 增加访问次数，{ new: true } 返回更新后的文档（避免返回旧值 +1 的估算）
    const updated = await ShareToken.findByIdAndUpdate(
      share._id,
      { $inc: { views: 1 } },
      { new: true }
    );

    res.json({
      success: true,
      data: {
        reportData: share.reportData,
        userName: share.userName,
        period: share.period,
        expiresAt: share.expiresAt,
        views: updated.views,  // 使用数据库返回的真实值
        sharedAt: share.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取分享报告失败', error: err.message });
  }
});

module.exports = router;
