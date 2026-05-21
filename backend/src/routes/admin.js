const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Service = require('../models/Service');
const CheckupPlan = require('../models/CheckupPlan');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const UserChangeLog = require('../models/UserChangeLog');
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
    Message.countDocuments({ type: 'user', unread: true }), // 用户发出的未读留言
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

// ── 服务商城 CRUD ─────────────────────────────────────────────────
// GET /api/admin/services
router.get('/services', adminAuth, async (req, res) => {
  const services = await Service.find().sort({ sortOrder: 1, createdAt: 1 });
  res.json({ success: true, data: services });
});

// POST /api/admin/services
router.post('/services', adminAuth, async (req, res) => {
  const { serviceId, category, name, subtitle, price, originalPrice,
          rating, reviewCount, tag, tagColor, icon, iconColor, features, sortOrder } = req.body;
  if (!serviceId || !name || !category) {
    return res.status(400).json({ success: false, message: '服务ID、名称、分类不能为空' });
  }
  const existing = await Service.findOne({ serviceId });
  if (existing) return res.status(400).json({ success: false, message: '服务ID已存在' });

  const service = await Service.create({
    serviceId, category, name, subtitle, price, originalPrice,
    rating, reviewCount, tag, tagColor, icon, iconColor,
    features: features || [], sortOrder: sortOrder || 0,
  });
  res.json({ success: true, data: service, message: '服务创建成功' });
});

// PUT /api/admin/services/:id
router.put('/services/:id', adminAuth, async (req, res) => {
  const { category, name, subtitle, price, originalPrice,
          rating, reviewCount, tag, tagColor, icon, iconColor, features, sortOrder, active } = req.body;
  const service = await Service.findByIdAndUpdate(
    req.params.id,
    { category, name, subtitle, price, originalPrice,
      rating, reviewCount, tag, tagColor, icon, iconColor, features, sortOrder, active },
    { new: true }
  );
  if (!service) return res.status(404).json({ success: false, message: '服务不存在' });
  res.json({ success: true, data: service, message: '服务更新成功' });
});

// PATCH /api/admin/services/:id/toggle
router.patch('/services/:id/toggle', adminAuth, async (req, res) => {
  const service = await Service.findById(req.params.id);
  if (!service) return res.status(404).json({ success: false, message: '服务不存在' });
  service.active = !service.active;
  await service.save();
  res.json({ success: true, data: service, message: service.active ? '服务已上架' : '服务已下架' });
});

// DELETE /api/admin/services/:id
router.delete('/services/:id', adminAuth, async (req, res) => {
  const service = await Service.findByIdAndDelete(req.params.id);
  if (!service) return res.status(404).json({ success: false, message: '服务不存在' });
  res.json({ success: true, message: '服务已删除' });
});

// ── 年度复查计划 ──────────────────────────────────────────────────
// GET /api/admin/patients/:id/checkup-plan?year=2025
router.get('/patients/:id/checkup-plan', adminAuth, async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const plan = await CheckupPlan.findOne({ user: req.params.id, year });
  res.json({ success: true, data: plan });
});

// POST /api/admin/checkup-plans — 创建或覆盖某用户年度计划
router.post('/checkup-plans', adminAuth, async (req, res) => {
  const { userId, year = new Date().getFullYear(), title, note, items = [] } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: '请指定患者ID' });

  const plan = await CheckupPlan.findOneAndUpdate(
    { user: userId, year },
    { title: title || `${year}年度复查计划`, note: note || '', items, createdBy: req.admin._id },
    { new: true, upsert: true, runValidators: true }
  );
  res.json({ success: true, data: plan, message: '复查计划已保存' });
});

// PATCH /api/admin/checkup-plans/:planId/items/:itemId — 更新单个复查项状态
router.patch('/checkup-plans/:planId/items/:itemId', adminAuth, async (req, res) => {
  const { status, note, targetDate } = req.body;
  const plan = await CheckupPlan.findById(req.params.planId);
  if (!plan) return res.status(404).json({ success: false, message: '复查计划不存在' });

  const item = plan.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: '复查项目不存在' });

  if (status !== undefined)     item.status     = status;
  if (note !== undefined)       item.note       = note;
  if (targetDate !== undefined) item.targetDate = targetDate;

  await plan.save();
  res.json({ success: true, data: plan, message: '复查项已更新' });
});

// ── 动态问卷管理 ──────────────────────────────────────────────────
// GET /api/admin/questionnaires
router.get('/questionnaires', adminAuth, async (req, res) => {
  const list = await DynamicQuestionnaire.find().sort({ createdAt: -1 })
    .populate('createdBy', 'name');
  // 附带回答人数
  const withCounts = await Promise.all(list.map(async q => {
    const count = await QuestionnaireResponse.countDocuments({ questionnaire: q._id });
    return { ...q.toObject(), responseCount: count };
  }));
  res.json({ success: true, data: withCounts });
});

// POST /api/admin/questionnaires
router.post('/questionnaires', adminAuth, async (req, res) => {
  const { title, description, questions, targetType, targetUsers, deadline } = req.body;
  if (!title || !questions?.length) {
    return res.status(400).json({ success: false, message: '问卷标题和问题不能为空' });
  }
  const q = await DynamicQuestionnaire.create({
    title, description: description || '',
    questions, targetType: targetType || 'all',
    targetUsers: targetUsers || [],
    createdBy: req.admin._id, deadline: deadline || '',
  });
  res.json({ success: true, data: q, message: '问卷创建成功' });
});

// PUT /api/admin/questionnaires/:id
router.put('/questionnaires/:id', adminAuth, async (req, res) => {
  const { title, description, questions, targetType, targetUsers, deadline } = req.body;
  const q = await DynamicQuestionnaire.findByIdAndUpdate(
    req.params.id,
    { title, description, questions, targetType, targetUsers, deadline },
    { new: true }
  );
  if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });
  res.json({ success: true, data: q, message: '问卷更新成功' });
});

// PATCH /api/admin/questionnaires/:id/status
router.patch('/questionnaires/:id/status', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['draft', 'active', 'closed'].includes(status)) {
    return res.status(400).json({ success: false, message: '状态值无效（draft/active/closed）' });
  }
  const q = await DynamicQuestionnaire.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });
  res.json({ success: true, data: q, message: '问卷状态已更新' });
});

// DELETE /api/admin/questionnaires/:id
router.delete('/questionnaires/:id', adminAuth, async (req, res) => {
  await DynamicQuestionnaire.findByIdAndDelete(req.params.id);
  await QuestionnaireResponse.deleteMany({ questionnaire: req.params.id });
  res.json({ success: true, message: '问卷及答卷已删除' });
});

// GET /api/admin/questionnaires/:id/responses
router.get('/questionnaires/:id/responses', adminAuth, async (req, res) => {
  const responses = await QuestionnaireResponse.find({ questionnaire: req.params.id })
    .populate('user', 'name phone')
    .sort({ submittedAt: -1 });
  res.json({ success: true, data: responses });
});

// ── GET /api/admin/change-logs — 用户信息变更记录（#34）──────────
router.get('/change-logs', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, field } = req.query;
    const filter = {};
    if (field) filter.field = field;
    const logs = await UserChangeLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    const total = await UserChangeLog.countDocuments(filter);
    res.json({ success: true, data: { logs, total, page: Number(page), limit: Number(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取变更记录失败', error: err.message });
  }
});

module.exports = router;
