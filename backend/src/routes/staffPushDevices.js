const router = require('express').Router();
const jwt = require('jsonwebtoken');
const staffAuth = require('../middleware/staffAuth');
const Device = require('../models/StaffPushDevice');
const User = require('../models/User');
const Message = require('../models/Message');
const { CHANNELS, pushReady, destination } = require('../utils/staffPushCore');

router.use(staffAuth);
router.get('/capabilities', (_req, res) => res.json({ success: true, data: { enabled: !!pushReady() } }));
router.get('/unread-count', async (req, res) => {
  try {
    const entry = Object.entries(CHANNELS).find(([, channel]) => channel.role === req.staff.role);
    if (!entry) return res.json({ success: true, data: { count: 0 } });
    const [recipient, channel] = entry;
    const patients = await User.find({ tenantId: req.staff.tenantId, [channel.field]: req.staff._id })
      .select('_id').lean();
    const count = await Message.countDocuments({ user: { $in: patients.map(patient => patient._id) },
      type: 'user', recipient, staffReadAt: null, recalled: { $ne: true } });
    return res.json({ success: true, data: { count: Math.min(99, count) } });
  } catch { return res.status(500).json({ success: false, message: '未读消息读取失败' }); }
});

router.put('/', async (req, res) => {
  try {
    if (!pushReady()) return res.status(503).json({ success: false, message: '医护端系统推送尚未开放' });
    const device = destination(req.body?.token);
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'admin' || String(decoded.id) !== String(req.staff._id) || !decoded.exp) {
      return res.status(401).json({ success: false, message: '请重新登录后开启通知' });
    }
    await Device.updateOne({ _id: device._id }, { $set: {
      token: device.token, staffId: req.staff._id, tenantId: req.staff.tenantId,
      tokenExpiresAt: new Date(decoded.exp * 1000),
    } }, { upsert: true, runValidators: true });
    return res.json({ success: true });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: '设备通知绑定失败' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const device = destination(req.body?.token);
    await Device.deleteOne({ _id: device._id, staffId: req.staff._id, tenantId: req.staff.tenantId });
    return res.json({ success: true });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: '设备通知解绑失败' });
  }
});
module.exports = router;
