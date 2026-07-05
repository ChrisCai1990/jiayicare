const express = require('express');
const auth = require('../middleware/auth');
const { synthesize } = require('../utils/tts');
const router = express.Router();

// POST /api/tts/synthesize — 文本转语音，返回可直接播放的 OSS URL
// sceneType 用于以后区分消息播报/AI分析朗读/提醒播报等场景，当前仅透传记录，不影响生成逻辑
router.post('/synthesize', auth, async (req, res) => {
  try {
    const { text, sceneType } = req.body;
    const { url } = await synthesize(text);
    res.json({ success: true, url, sceneType: sceneType || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
