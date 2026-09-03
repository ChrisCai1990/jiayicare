const express = require('express');
const auth = require('../middleware/auth');
const { parseImage } = require('../utils/ai');
const { PROMPT, imageHash, parseResult, issueDraft } = require('../utils/bloodPressurePhoto');
const router = express.Router();
const active = new Set();
const recent = new Map();
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of recent) if (now - value.start > 60000) recent.delete(key);
}, 60000);
sweep.unref();

router.post('/recognize-blood-pressure', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.body.consent !== true) return res.status(400).json({ success: false, message: '请先同意将所选图片发送至通义千问进行识别' });
  let hash;
  try { hash = imageHash(req.body.image); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  if (!process.env.QWEN_API_KEY) return res.status(503).json({ success: false, message: '图片识别暂不可用，请手工录入' });
  const key = String(req.user._id);
  const window = recent.get(key);
  const count = window && Date.now() - window.start < 60000 ? window.count : 0;
  if (active.has(key) || active.size >= 8 || count >= 5) return res.status(429).json({ success: false, message: '识别请求较多，请稍后再试' });
  recent.set(key, { start: count ? window.start : Date.now(), count: count + 1 });
  active.add(key);
  try {
    const values = parseResult(await parseImage(req.body.image, PROMPT, { maxTokens: 200, timeoutMs: 45000 }));
    res.json({ success: true, data: { ...values, token: issueDraft(key, hash, values),
      message: '请逐项核对原图。空白项表示无法确定，请手工补填；测量时间需自行确认。' } });
  } catch {
    res.status(502).json({ success: false, message: '图片识别失败，请重试或手工录入' });
  } finally { active.delete(key); }
});
module.exports = router;
