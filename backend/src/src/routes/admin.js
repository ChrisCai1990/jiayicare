const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Order = require('../models/Order');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// ── 初始化默认管理员账号（首次启动时） ──────────────────────────
async function seedAdmins() {
  const count = await Admin.countDocuments();
  if (count > 0) return;
  await Admin.create([
    { username: 'doctor1',  password: 'jiayi2024', name: '王主任',  role: 'doctor',  title: '心血管内科主任医师' },
    { username: 'manager1', password: 'jiayi2024', name: '李健管',  role: 'manager', title: '高级健康管理师' },
  ]);
  console.log('✅ 已创建默认管理员账号');
}
seedAdmins().catch(console.error);

// ── POST /api/admin/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }
  const admin = await Admin.findOne({ username });
  if (!admin || !(await admin.comparePassword(password))) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  const token = jwt.sign(
    { id: admin._id, type: 'admin', role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    success: true,
    data: {
      token,
      admin: { _id: admin._id, name: admin.name, role: admin.role, title: admin.title },
    },
  });
});

// ── GET /api/admin/dashboard ──────────────────────────────────────
router.get('/dashboard', adminAuth, async (req, res) => {
  const [totalPatients, pendingOrders, unreadMessages, recentPatients] = await Promise.all([
    User.countDocuments(),
    Order.countDocuments({ status: 'pending' }),
    Message.countDocuments({ type: 'user', unread: false }), // 用户发出的留言
    User.find().sort({ createdAt: -1 }).limit(5).select('name phone servicePackage healthScore createdAt'),
  ]);

  // 近7天新增患者
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const newPatients = await User.countDocuments({ createdAt: { $gt: sevenDaysAgo } });

  res.json({
    success: true,
    data: { totalPatients, pendingOrders, unreadMessages, newPatients, recentPatients },
  });
});

// ── GET /api/admin/patients ───────────────────────────────────────
router.get('/patients', adminAuth, async (req, res) => {
  const { q = '', page = 1, limit = 20, hasService } = req.query;
  const filter = {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ];
  }
  if (hasService === 'true')  filter.servicePackage = { $ne: '' };
  if (hasService === 'false') filter.$or = [{ servicePackage: '' }, { servicePackage: { $exists: false } }];

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [patients, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('name phone age gender healthScore servicePackage serviceExpiry onboardingCompleted createdAt'),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, data: patients, total, page: parseInt(page), limit: parseInt(limit) });
});

// ── GET /api/admin/patients/:id ───────────────────────────────────
router.get('/patients/:id', adminAuth, async (req, res) => {
  const userId = req.params.id;
  const [user, records, tasks, messages, orders] = await Promise.all([
    User.findById(userId).select('-password'),
    HealthRecord.find({ user: userId }).sort({ recordedAt: -1 }).limit(20),
    Task.find({ user: userId }).sort({ createdAt: -1 }).limit(20),
    Message.find({ user: userId }).sort({ createdAt: -1 }).limit(30),
    Order.find({ user: userId }).sort({ createdAt: -1 }).limit(10),
  ]);
  if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

  // 最新各类指标
  const latestVitals = {};
  for (const type of ['bloodPressure', 'bloodSugar', 'heartRate', 'weight', 'sleep']) {
    latestVitals[type] = records.find(r => r.type === type) || null;
  }

  res.json({ success: true, data: { user, latestVitals, records, tasks, messages, orders } });
});

// ── POST /api/admin/patients/:id/message ─────────────────────────
// 以医生/健管师身份向患者发送消息
router.post('/patients/:id/message', adminAuth, async (req, res) => {
  const { title, content } = req.body;
  if (!content?.trim()) {
    return res.status(400).json({ success: false, message: '消息内容不能为空' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

  const msgType = req.admin.role === 'manager' ? 'manager' : 'doctor';
  const msg = await Message.create({
    user:    req.params.id,
    type:    msgType,
    sender:  `${req.admin.name}（${req.admin.title || (msgType === 'doctor' ? '医生' : '健管师')}）`,
    title:   title || `来自${req.admin.name}的消息`,
    content: content.trim(),
    unread:  true,
  });

  res.json({ success: true, data: msg, message: '消息已发送' });
});

// ── POST /api/admin/patients/:id/task ────────────────────────────
// 为患者创建任务
router.post('/patients/:id/task', adminAuth, async (req, res) => {
  const { title, category = 'followup', description = '', priority = 2 } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ success: false, message: '任务标题不能为空' });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

  const task = await Task.create({
    user:     req.params.id,
    title:    title.trim(),
    category,
    description,
    priority: parseInt(priority),
    status:   'pending',
    source:   'admin',
  });

  res.json({ success: true, data: task, message: '任务已创建' });
});

// ── GET /api/admin/orders ─────────────────────────────────────────
router.get('/orders', adminAuth, async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, data: orders, total, page: parseInt(page) });
});

// ── PATCH /api/admin/orders/:id/status ───────────────────────────
router.patch('/orders/:id/status', adminAuth, async (req, res) => {
  const { status, scheduledAt } = req.body;
  const VALID = ['pending', 'scheduled', 'completed', 'cancelled'];
  if (!VALID.includes(status)) {
    return res.status(400).json({ success: false, message: '状态值无效' });
  }

  const update = { status };
  if (status === 'scheduled' && scheduledAt) update.scheduledAt = new Date(scheduledAt);
  if (status === 'completed') update.completedAt = new Date();

  const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true })
    .populate('user', 'name phone');
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });

  res.json({ success: true, data: order, message: `订单已更新为：${status}` });
});

// ── GET /api/admin/messages ───────────────────────────────────────
// 查看所有患者发给医生/健管师的留言
router.get('/messages', adminAuth, async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [messages, total] = await Promise.all([
    Message.find({ type: 'user' })
      .populate('user', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Message.countDocuments({ type: 'user' }),
  ]);

  res.json({ success: true, data: messages, total });
});

module.exports = router;
