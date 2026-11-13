const router = require('express').Router();
const auth = require('../middleware/auth');
const { createPushDeviceRegistry, PushDeviceInputError } = require('../utils/pushDeviceRegistry');
const { nativePushReady } = require('../utils/nativePushConfig');
const registry = createPushDeviceRegistry({
  Device: require('../models/PushDevice'),
  Session: require('../models/LoginSession'),
  enabled: nativePushReady,
});
const Device = require('../models/PushDevice');
const { categories } = require('../utils/nativePushCategory');

// Authenticated writes only. Never echo or log device tokens in responses.
router.use(auth);
router.get('/capabilities', (req, res) => {
  res.json({ success: true, data: { enabled: nativePushReady(),
    providers: ['huawei', 'apns'].filter(provider => nativePushReady(provider)) } });
});
router.get('/settings', async (req, res, next) => {
  try {
    const device = await Device.findOne({ user: req.user._id, sessionId: req.authSessionId })
      .select('settings +sessionId').lean();
    res.json({ success: true, data: Object.fromEntries(categories.map(key => [key, device?.settings?.[key] !== false])) });
  } catch { next(new Error('通知设置读取失败')); }
});
router.patch('/settings', async (req, res, next) => {
  try {
    const { key, enabled } = req.body || {};
    if (!categories.includes(key) || typeof enabled !== 'boolean') return res.status(400).json({ success: false, message: '通知设置无效' });
    const result = await Device.updateMany({ user: req.user._id, sessionId: req.authSessionId }, { $set: { [`settings.${key}`]: enabled } });
    if (!result.matchedCount) return res.status(409).json({ success: false, message: '请先开启此设备的系统通知' });
    res.json({ success: true, data: { key, enabled } });
  } catch { next(new Error('通知设置保存失败')); }
});
for (const [method, operation] of [['put', 'register'], ['delete', 'unregister']]) {
  router[method]('/', async (req, res, next) => {
    try {
      await registry[operation](req.user, req.authSessionId, req.body);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof PushDeviceInputError) return res.status(error.status).json({ success: false, message: error.message });
      // Database errors may contain the raw destination; do not pass them to logging middleware.
      next(new Error('设备通知设置保存失败'));
    }
  });
}
module.exports = router;
