const router = require('express').Router();
const auth = require('../middleware/auth');
const { createPushDeviceRegistry, PushDeviceInputError } = require('../utils/pushDeviceRegistry');
const { nativePushReady } = require('../utils/nativePushConfig');
const registry = createPushDeviceRegistry({
  Device: require('../models/PushDevice'),
  Session: require('../models/LoginSession'),
  enabled: nativePushReady,
});

// Authenticated writes only. Never echo or log device tokens in responses.
router.use(auth);
router.get('/capabilities', (req, res) => {
  res.json({ success: true, data: { enabled: nativePushReady() } });
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
