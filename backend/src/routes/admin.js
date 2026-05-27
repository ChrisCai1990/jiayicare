const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Service = require('../models/Service');
const Product = require('../models/Product');
const MemberType = require('../models/MemberType');
const PlanTemplate = require('../models/PlanTemplate');
const CheckupPlan = require('../models/CheckupPlan');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const UserChangeLog = require('../models/UserChangeLog');
const MedicalReport = require('../models/MedicalReport');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// ── 初始化默认管理员账号（首次启动时） ──────────────────────────
async function seedAdmins() {
  const count = await Admin.countDocuments();
  if (count > 0) return;
  await Admin.create([
    { username: 'superadmin', password: 'jiayi2024', name: '超级管理员', role: 'superadmin', title: '' },
    { username: 'doctor1',    password: 'jiayi2024', name: '王主任',     role: 'doctor',     title: '心血管内科主任医师' },
    { username: 'manager1',   password: 'jiayi2024', name: '李健管',     role: 'manager',    title: '高级健康管理师' },
    { username: 'staff001', password: 'jiayi2024', name: '张健管', role: 'healthManager', title: '健康管理师' },
    { username: 'staff002', password: 'jiayi2024', name: '李医生', role: 'familyDoctor',  title: '全科医生' },
  ]);
  console.log('✅ 已创建默认账号（含医护端）');
}
seedAdmins().catch(console.error);

// ── 确保关键账号始终存在且密码正确 ──────────────────────────────
async function ensureStaffTestAccounts() {
  const testAccounts = [
    // superadmin 主账号——每次启动校验密码，不匹配则重置
    { username: 'superadmin',   password: 'jiayi2024', name: '超级管理员', role: 'superadmin',      title: '',             resetIfWrong: true },
    { username: 'jy_super',     password: 'jiayi2024', name: '超管测试',   role: 'superadmin',      title: '超级管理员' },
    { username: 'jy_hm',        password: 'jiayi2024', name: '测试健管',   role: 'healthManager',   title: '健康管理师' },
    { username: 'jy_fd',        password: 'jiayi2024', name: '测试家医',   role: 'familyDoctor',    title: '全科医生' },
    { username: 'jy_ns',        password: 'jiayi2024', name: '测试营养',   role: 'nutritionist',    title: '注册营养师' },
    { username: 'jy_ma',        password: 'jiayi2024', name: '测试就医',   role: 'medicalAssistant',title: '就医专员' },
    { username: 'jy_hp',        password: 'jiayi2024', name: '测试规划',   role: 'healthPlanner',   title: '健康规划师' },
    { username: 'jy_tcm',       password: 'jiayi2024', name: '测试中医',   role: 'tcmDoctor',       title: '中医师' },
    { username: 'jy_rb',        password: 'jiayi2024', name: '测试复健',   role: 'rehabSpecialist', title: '运动复健师' },
  ];
  for (const acc of testAccounts) {
    const exists = await Admin.findOne({ username: acc.username });
    if (!exists) {
      const { resetIfWrong, ...data } = acc;
      await Admin.create(data);
      console.log(`✅ 创建账号: ${acc.username}`);
    } else if (acc.resetIfWrong) {
      // 校验密码，不匹配则重置（仅针对 resetIfWrong 标记的账号）
      const ok = await exists.comparePassword(acc.password);
      if (!ok) {
        exists.password = acc.password;
        await exists.save(); // 触发 bcrypt pre-save
        console.log(`🔑 重置账号密码: ${acc.username}`);
      }
    }
  }
}
ensureStaffTestAccounts().catch(console.error);

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
  if (!user) return res.status(404).json({ success: false, message: '会员不存在' });

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
  if (!user) return res.status(404).json({ success: false, message: '会员不存在' });

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
  if (!user) return res.status(404).json({ success: false, message: '会员不存在' });

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
  if (!userId) return res.status(400).json({ success: false, message: '请指定会员ID' });

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

// 工具函数：规范化选项格式（兼容旧版纯字符串和新版对象格式）
// 必须用 .lean() 获取原始数据后才能正确处理字符串，否则 Mongoose 会将字符串转为空对象
function normalizeQOptions(opts) {
  return (opts || []).map(o =>
    typeof o === 'string'
      ? { label: o, allowInput: false, exclusive: false, score: 0 }
      : { label: o.label || '', allowInput: !!o.allowInput, exclusive: !!o.exclusive, score: o.score || 0 }
  );
}
function normalizeQuestions(questions) {
  return (questions || []).map(q => ({
    ...q,
    options:     normalizeQOptions(q.options),
    jumpLogic:   q.jumpLogic   || [],
    scoreEnabled: !!q.scoreEnabled,
  }));
}

// GET /api/admin/questionnaires
router.get('/questionnaires', adminAuth, async (req, res) => {
  // 用 lean() 获取原始 JS 对象，避免 Mongoose 把旧版字符串选项转为空 subdocument
  const list = await DynamicQuestionnaire.find().sort({ sortOrder: 1, createdAt: -1 })
    .populate('createdBy', 'name').lean();
  const withCounts = await Promise.all(list.map(async q => {
    const count = await QuestionnaireResponse.countDocuments({ questionnaire: q._id });
    return { ...q, questions: normalizeQuestions(q.questions), responseCount: count };
  }));
  res.json({ success: true, data: withCounts });
});

// POST /api/admin/questionnaires
router.post('/questionnaires', adminAuth, async (req, res) => {
  const { title, description, questions, targetType, targetUsers, deadline, scoringEnabled, sortOrder } = req.body;
  if (!title || !questions?.length) {
    return res.status(400).json({ success: false, message: '问卷标题和问题不能为空' });
  }
  const maxDoc = await DynamicQuestionnaire.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  const newSortOrder = (sortOrder !== undefined && sortOrder !== null) ? sortOrder : ((maxDoc?.sortOrder || 0) + 1);
  const q = await DynamicQuestionnaire.create({
    title, description: description || '',
    questions, targetType: targetType || 'all',
    targetUsers: targetUsers || [],
    createdBy: req.admin._id, deadline: deadline || '',
    scoringEnabled: !!scoringEnabled,
    sortOrder: newSortOrder,
  });
  res.json({ success: true, data: q, message: '问卷创建成功' });
});

// PATCH /api/admin/questionnaires/reorder（批量更新排序）— 必须在 /:id 路由之前
router.patch('/questionnaires/reorder', adminAuth, async (req, res) => {
  const { items } = req.body; // [{ id, sortOrder }, ...]
  if (!Array.isArray(items)) return res.status(400).json({ success: false, message: 'items 必须是数组' });
  await Promise.all(items.map(({ id, sortOrder }) =>
    DynamicQuestionnaire.findByIdAndUpdate(id, { sortOrder })
  ));
  res.json({ success: true, message: '排序已更新' });
});

// POST /api/admin/questionnaires/:id/copy
router.post('/questionnaires/:id/copy', adminAuth, async (req, res) => {
  try {
    // 用 lean() 拿到原始数据，保留旧版字符串选项的实际值
    const orig = await DynamicQuestionnaire.findById(req.params.id).lean();
    if (!orig) return res.status(404).json({ success: false, message: '问卷不存在' });
    const maxDoc = await DynamicQuestionnaire.findOne().sort({ sortOrder: -1 }).select('sortOrder').lean();

    const copy = await DynamicQuestionnaire.create({
      title: orig.title + '（复制）',
      description: orig.description,
      questions: normalizeQuestions(orig.questions), // lean() 后字符串选项正确还原
      targetType: orig.targetType,
      targetUsers: orig.targetUsers || [],
      deadline: orig.deadline || '',
      scoringEnabled: orig.scoringEnabled || false,
      status: 'draft',
      createdBy: req.admin._id,
      sortOrder: (maxDoc?.sortOrder || 0) + 1,
    });
    res.json({ success: true, data: copy, message: '问卷复制成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: '复制失败：' + err.message });
  }
});

// PUT /api/admin/questionnaires/:id
router.put('/questionnaires/:id', adminAuth, async (req, res) => {
  const { title, description, questions, targetType, targetUsers, deadline, scoringEnabled, sortOrder } = req.body;
  const updateData = { title, description, questions, targetType, targetUsers, deadline, scoringEnabled: !!scoringEnabled };
  if (sortOrder !== undefined && sortOrder !== null) updateData.sortOrder = sortOrder;
  const q = await DynamicQuestionnaire.findByIdAndUpdate(req.params.id, updateData, { new: true });
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

// ── 医护账号管理 ────────────────────────────────────────────────────
const STAFF_ROLES = [
  'familyDoctor', 'nutritionist', 'healthManager',
  'medicalAssistant', 'psychologist', 'rehabSpecialist',
  'tcmDoctor', 'specialist', 'healthPlanner',
];

// GET /api/admin/staff — 列出所有医护账号
router.get('/staff', adminAuth, async (req, res) => {
  const { role = '' } = req.query;
  const filter = { role: { $in: STAFF_ROLES } };
  if (role && STAFF_ROLES.includes(role)) filter.role = role;
  const list = await Admin.find(filter).select('-password').sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

// POST /api/admin/staff — 新建医护账号（仅 superadmin）
router.post('/staff', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可创建医护账号' });
  }
  const { username, password, name, role, title, department, region } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ success: false, message: '用户名、密码、姓名、角色不能为空' });
  }
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '角色无效' });
  }
  const existing = await Admin.findOne({ username });
  if (existing) return res.status(400).json({ success: false, message: '用户名已存在' });

  const staff = await Admin.create({ username, password, name, role, title: title || '', department: department || '', region: region || '' });
  res.json({ success: true, data: { _id: staff._id, username: staff.username, name: staff.name, role: staff.role } });
});

// PUT /api/admin/staff/:id — 更新医护账号信息
router.put('/staff/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可修改医护账号' });
  }
  const { name, role, title, department, region, password } = req.body;
  const update = {};
  if (name) update.name = name;
  if (role && STAFF_ROLES.includes(role)) update.role = role;
  if (title !== undefined) update.title = title;
  if (department !== undefined) update.department = department;
  if (region !== undefined) update.region = region;

  const staff = await Admin.findById(req.params.id);
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    return res.status(404).json({ success: false, message: '医护账号不存在' });
  }
  Object.assign(staff, update);
  if (password) staff.password = password; // triggers bcrypt pre-save
  await staff.save();
  res.json({ success: true, data: { _id: staff._id, name: staff.name, role: staff.role } });
});

// DELETE /api/admin/staff/:id — 删除医护账号（仅 superadmin）
router.delete('/staff/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可删除医护账号' });
  }
  const staff = await Admin.findById(req.params.id);
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    return res.status(404).json({ success: false, message: '医护账号不存在' });
  }
  await staff.deleteOne();
  res.json({ success: true, message: '账号已删除' });
});

// ── 体检报告管理 ───────────────────────────────────────────────────

// GET /api/admin/medical-reports?status=&patientId=&page=&limit=
router.get('/medical-reports', adminAuth, async (req, res) => {
  try {
    const { status, patientId, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.audit_status = status;
    if (patientId) filter.user = patientId;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [reports, total] = await Promise.all([
      MedicalReport.find(filter)
        .select('-content')
        .populate('user', 'name phone')
        .populate('uploadedBy', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      MedicalReport.countDocuments(filter),
    ]);
    res.json({ success: true, data: { reports, total } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/medical-reports/:id — 报告详情（含文件内容）
router.get('/medical-reports/:id', adminAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id)
      .populate('user', 'name phone')
      .populate('uploadedBy', 'name');
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/admin/medical-reports/:id/audit — 审核报告
router.patch('/medical-reports/:id/audit', adminAuth, async (req, res) => {
  try {
    const { action, rejectReason } = req.body; // action: 'approve' | 'reject'
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });

    if (action === 'approve') {
      report.audit_status = 'audited';
      report.audited_by = req.admin.name;
      report.audited_at = new Date();
      report.reject_reason = undefined;
    } else if (action === 'reject') {
      report.audit_status = 'rejected';
      report.audited_by = req.admin.name;
      report.audited_at = new Date();
      report.reject_reason = rejectReason || '不符合要求';
    } else {
      return res.status(400).json({ success: false, message: 'action 必须是 approve 或 reject' });
    }

    await report.save();
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 会员类型管理 ──────────────────────────────────────────────────

async function seedMemberTypes() {
  const count = await MemberType.countDocuments();
  if (count > 0) return;
  await MemberType.insertMany([
    { name: '年度会员', active: true, sortOrder: 0 },
    { name: '半年会员', active: true, sortOrder: 1 },
    { name: '季度会员', active: true, sortOrder: 2 },
  ]);
}
seedMemberTypes().catch(console.error);

// GET /api/admin/member-types
router.get('/member-types', adminAuth, async (req, res) => {
  const types = await MemberType.find().sort({ sortOrder: 1, createdAt: 1 });
  res.json({ success: true, data: types });
});

// POST /api/admin/member-types
router.post('/member-types', adminAuth, async (req, res) => {
  const { name, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '名称不能为空' });
  const existing = await MemberType.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '该会员类型已存在' });
  const mt = await MemberType.create({ name, sortOrder: sortOrder || 0 });
  res.json({ success: true, data: mt });
});

// PATCH /api/admin/member-types/:id/toggle
router.patch('/member-types/:id/toggle', adminAuth, async (req, res) => {
  const mt = await MemberType.findById(req.params.id);
  if (!mt) return res.status(404).json({ success: false, message: '会员类型不存在' });
  mt.active = !mt.active;
  await mt.save();
  res.json({ success: true, data: mt });
});

// DELETE /api/admin/member-types/:id
router.delete('/member-types/:id', adminAuth, async (req, res) => {
  await MemberType.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '已删除' });
});

// ── 商城产品管理 ──────────────────────────────────────────────────

// GET /api/admin/products
router.get('/products', adminAuth, async (req, res) => {
  const { name, category, status } = req.query;
  const filter = {};
  if (name) filter.name = new RegExp(name, 'i');
  if (category) filter.category = category;
  if (status) filter.status = status;
  const products = await Product.find(filter).sort({ sortOrder: 1, createdAt: -1 });
  res.json({ success: true, data: products });
});

// POST /api/admin/products
router.post('/products', adminAuth, async (req, res) => {
  const { name, images, originalPrice, memberPrices, category, sortOrder, features, description, stock, status } = req.body;
  if (!name || !category || originalPrice === undefined) {
    return res.status(400).json({ success: false, message: '名称、分类、原价为必填项' });
  }
  const product = await Product.create({
    name, images: images || [], originalPrice, memberPrices: memberPrices || {},
    category, sortOrder: sortOrder ?? 999, features: features || [],
    description: description || '', stock: stock ?? 0, status: status || 'off',
  });
  res.json({ success: true, data: product, message: '产品创建成功' });
});

// PUT /api/admin/products/:id
router.put('/products/:id', adminAuth, async (req, res) => {
  const { name, images, originalPrice, memberPrices, category, sortOrder, features, description, stock, status } = req.body;
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { name, images, originalPrice, memberPrices, category, sortOrder, features, description, stock, status },
    { new: true }
  );
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  res.json({ success: true, data: product, message: '产品更新成功' });
});

// PATCH /api/admin/products/:id/toggle
router.patch('/products/:id/toggle', adminAuth, async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  product.status = product.status === 'on' ? 'off' : 'on';
  await product.save();
  res.json({ success: true, data: product, message: product.status === 'on' ? '产品已上架' : '产品已下架' });
});

// PATCH /api/admin/products/batch-toggle
router.patch('/products/batch-toggle', adminAuth, async (req, res) => {
  const { ids, status } = req.body;
  if (!ids || !ids.length || !['on', 'off'].includes(status)) {
    return res.status(400).json({ success: false, message: '参数错误' });
  }
  await Product.updateMany({ _id: { $in: ids } }, { status });
  res.json({ success: true, message: `已批量${status === 'on' ? '上架' : '下架'} ${ids.length} 件产品` });
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', adminAuth, async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  res.json({ success: true, message: '产品已删除' });
});

// ── 健康方案模板管理 ──────────────────────────────────────────────

// GET /api/admin/plan-templates?type=
router.get('/plan-templates', adminAuth, async (req, res) => {
  const { type } = req.query;
  const filter = type ? { type } : {};
  const templates = await PlanTemplate.find(filter).sort({ createdAt: -1 });
  res.json({ success: true, data: templates });
});

// POST /api/admin/plan-templates
router.post('/plan-templates', adminAuth, async (req, res) => {
  const { type, name, status, content } = req.body;
  if (!type || !name) return res.status(400).json({ success: false, message: '类型和名称不能为空' });
  const tpl = await PlanTemplate.create({ type, name, status: status || 'active', content: content || {} });
  res.json({ success: true, data: tpl, message: '模板创建成功' });
});

// PUT /api/admin/plan-templates/:id
router.put('/plan-templates/:id', adminAuth, async (req, res) => {
  const { name, status, content } = req.body;
  const tpl = await PlanTemplate.findByIdAndUpdate(
    req.params.id,
    { name, status, content },
    { new: true }
  );
  if (!tpl) return res.status(404).json({ success: false, message: '模板不存在' });
  res.json({ success: true, data: tpl, message: '模板更新成功' });
});

// POST /api/admin/plan-templates/:id/copy
router.post('/plan-templates/:id/copy', adminAuth, async (req, res) => {
  const src = await PlanTemplate.findById(req.params.id);
  if (!src) return res.status(404).json({ success: false, message: '模板不存在' });
  const copy = await PlanTemplate.create({ type: src.type, name: src.name + '（副本）', status: 'inactive', content: src.content });
  res.json({ success: true, data: copy, message: '模板已复制' });
});

// PATCH /api/admin/plan-templates/:id/toggle
router.patch('/plan-templates/:id/toggle', adminAuth, async (req, res) => {
  const tpl = await PlanTemplate.findById(req.params.id);
  if (!tpl) return res.status(404).json({ success: false, message: '模板不存在' });
  tpl.status = tpl.status === 'active' ? 'inactive' : 'active';
  await tpl.save();
  res.json({ success: true, data: tpl });
});

// DELETE /api/admin/plan-templates/:id
router.delete('/plan-templates/:id', adminAuth, async (req, res) => {
  await PlanTemplate.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '模板已删除' });
});

module.exports = router;
