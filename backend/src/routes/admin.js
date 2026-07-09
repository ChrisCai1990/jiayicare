const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const Admin = require('../models/Admin');
const User = require('../models/User');
const HealthRecord = require('../models/HealthRecord');
const Task = require('../models/Task');
const Message = require('../models/Message');
const Order = require('../models/Order');
const Service = require('../models/Service');
const Product = require('../models/Product');
const ProductCategory = require('../models/ProductCategory');
const MemberType = require('../models/MemberType');
const Partner = require('../models/Partner');
const PartnerBenefit = require('../models/PartnerBenefit');
const Enterprise = require('../models/Enterprise');
const PlanTemplate = require('../models/PlanTemplate');
const CheckupPlan = require('../models/CheckupPlan');
const AnnualPlan = require('../models/AnnualPlan');
const AnnualPlanTemplate = require('../models/AnnualPlanTemplate');
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const UserChangeLog = require('../models/UserChangeLog');
const MedicalReport = require('../models/MedicalReport');
const SystemConfig  = require('../models/SystemConfig');
const FollowUpPlan  = require('../models/FollowUpPlan');
const Commission    = require('../models/Commission');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

// ── 图片上传（multer） ───────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 图片全类型 + PDF，覆盖产品图、素材及各类附件
    if (/^image\//.test(file.mimetype) || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('仅支持图片（JPG/PNG/HEIC 等）或 PDF 文件'));
  },
});

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
  // superadmin 每次启动无条件更新密码，防止 DB 中存的是明文或旧哈希
  const sa = await Admin.findOne({ username: 'superadmin' });
  if (!sa) {
    await Admin.create({ username: 'superadmin', password: 'jiayi2024', name: '超级管理员', role: 'superadmin', title: '' });
    console.log('✅ 创建 superadmin 账号');
  } else {
    sa.password = 'jiayi2024';
    await sa.save(); // 触发 bcrypt pre-save 重新哈希
    console.log('🔑 superadmin 密码已同步');
  }

  // 平台超管（SaaS运营方，跨机构）——不存在则创建，供机构管理入口使用
  const ps = await Admin.findOne({ username: 'platform' });
  if (!ps) {
    await Admin.create({ username: 'platform', password: 'jiayi2024', name: '平台超管', role: 'platformSuper', title: '平台运营' });
    console.log('✅ 创建 platformSuper 账号: platform / jiayi2024');
  } else if (ps.role !== 'platformSuper') {
    ps.role = 'platformSuper'; await ps.save();
  }

  const testAccounts = [
    { username: 'jy_super', password: 'jiayi2024', name: '超管测试',   role: 'superadmin',       title: '超级管理员' },
    { username: 'jy_hm',    password: 'jiayi2024', name: '测试健管',   role: 'healthManager',    title: '健康管理师' },
    { username: 'jy_fd',    password: 'jiayi2024', name: '测试家医',   role: 'familyDoctor',     title: '全科医生' },
    { username: 'jy_ns',    password: 'jiayi2024', name: '测试营养',   role: 'nutritionist',     title: '注册营养师' },
    { username: 'jy_ma',    password: 'jiayi2024', name: '测试就医',   role: 'medicalAssistant', title: '就医专员' },
    { username: 'jy_hp',    password: 'jiayi2024', name: '测试规划',   role: 'healthPlanner',    title: '健康规划师' },
    { username: 'jy_tcm',   password: 'jiayi2024', name: '测试中医',   role: 'tcmDoctor',        title: '中医师' },
    { username: 'jy_rb',    password: 'jiayi2024', name: '测试复健',   role: 'rehabSpecialist',  title: '运动复健师' },
  ];
  for (const acc of testAccounts) {
    const exists = await Admin.findOne({ username: acc.username });
    if (!exists) {
      await Admin.create(acc);
      console.log(`✅ 创建测试医护账号: ${acc.username}`);
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
  // 企业HR账号仅可通过 /api/enterprise-hr/login 独立入口登录，不允许进入超管/医护后台
  if (admin.role === 'enterprise_hr') {
    return res.status(403).json({ success: false, message: '企业HR账号请使用企业客户专属登录入口' });
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
  const { status, page = 1, limit = 20, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (search) filter.serviceName = { $regex: search, $options: 'i' };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  let userIds;
  if (search) {
    const User = require('../models/User');
    const users = await User.find({ $or: [{ name: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }] }).select('_id');
    userIds = users.map(u => u._id);
    filter.$or = [{ serviceName: { $regex: search, $options: 'i' } }, { user: { $in: userIds } }];
    delete filter.serviceName;
  }

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

// ── PATCH /api/admin/orders/:id/pay — 人工标记已支付（暂未接支付网关，见backend/CLAUDE.md待办）──
router.patch('/orders/:id/pay', adminAuth, async (req, res) => {
  const { paymentMethod, paidAmount } = req.body;
  const VALID_METHODS = ['wechat', 'alipay', 'onsite', 'healthFund'];
  if (!VALID_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: '支付方式无效' });
  }
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.paymentStatus === 'paid') return res.status(400).json({ success: false, message: '该订单已标记为已支付，请勿重复操作' });

  order.paymentMethod = paymentMethod;
  order.paymentStatus = 'paid';
  order.paidAmount = paidAmount !== undefined ? Number(paidAmount) : order.servicePrice;
  order.paidAt = new Date();
  order.paidBy = req.admin._id;
  // 生成核销码（8位大写字母数字，供到店核销时输入/扫码比对）
  order.verifyCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  await order.save();

  res.json({ success: true, data: order, message: '已标记为已支付，核销码：' + order.verifyCode });
});

// ── PATCH /api/admin/orders/:id/verify — 到店核销 ──
router.patch('/orders/:id/verify', adminAuth, async (req, res) => {
  const { verifyCode } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.paymentStatus !== 'paid') return res.status(400).json({ success: false, message: '订单未支付，无法核销' });
  if (order.verifiedAt) return res.status(400).json({ success: false, message: '该订单已核销，请勿重复操作' });
  if (!verifyCode || verifyCode.toUpperCase() !== order.verifyCode) {
    return res.status(400).json({ success: false, message: '核销码不正确' });
  }

  order.verifiedAt = new Date();
  order.verifiedBy = req.admin._id;
  order.status = 'completed';
  order.completedAt = new Date();
  await order.save();

  // 核销后触发绩效自动结算——若订单未设置转介绍人/服务人归属(referrerId/fulfillerId)，
  // settleOrderCommission 会静默跳过不生成任何记录，容易让人以为"核销成功=绩效自动生成"，
  // 2026-07-07 用户反馈需要提醒：核销时明确告知是否真的生成了绩效，避免遗漏归属导致漏发绩效却无人察觉
  const { settleOrderCommission } = require('../utils/commissionSettlement');
  const { created } = await settleOrderCommission(order);
  const noAttribution = !order.referrerId && !order.fulfillerId;

  res.json({
    success: true,
    data: order,
    message: created.length
      ? `核销成功，已生成${created.length}条待结算绩效`
      : noAttribution
        ? '核销成功，但该订单未设置转介绍人/服务人归属，未生成任何绩效记录——如需生成绩效，请先设置归属后联系超管重新触发结算'
        : '核销成功，但该订单归属人对应的绩效规则未配置或规则为"不分佣"，未生成绩效记录',
  });
});

// ── PATCH /api/admin/orders/:id/attribution — 设置转介绍人/服务人归属（核销结算前需先设置，否则无归属不生成绩效）──
router.patch('/orders/:id/attribution', adminAuth, async (req, res) => {
  const { referrerId, fulfillerId } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { referrerId: referrerId || null, fulfillerId: fulfillerId || null },
    { new: true }
  ).populate('referrerId', 'name role').populate('fulfillerId', 'name role');
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  res.json({ success: true, data: order, message: '绩效归属已更新' });
});

// ── 佣金审核打款流程 ────────────────────────────────────────────
// 状态机：pending（核销后自动生成，待审核）→ confirmed（超管/manager审核通过，待打款）→ paid（已打款）
//                                        └→ cancelled（审核驳回，不予结算）
const COMMISSION_ADMIN_ROLES = ['superadmin', 'manager'];

// GET /api/admin/commissions — 佣金列表（按状态/角色/员工筛选）
router.get('/commissions', adminAuth, async (req, res) => {
  if (!COMMISSION_ADMIN_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '无权限查看佣金数据' });
  }
  const { status, role, staffId, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (role) filter.role = role;
  if (staffId) filter.staffId = staffId;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [records, total] = await Promise.all([
    Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate('staffId', 'name role').populate('patientId', 'name phone').populate('orderId', 'serviceName servicePrice'),
    Commission.countDocuments(filter),
  ]);
  res.json({ success: true, data: records, total, page: parseInt(page) });
});

// PATCH /api/admin/commissions/:id/confirm — 审核通过（pending → confirmed）
router.patch('/commissions/:id/confirm', adminAuth, async (req, res) => {
  if (!COMMISSION_ADMIN_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '无权限审核佣金' });
  }
  const commission = await Commission.findById(req.params.id);
  if (!commission) return res.status(404).json({ success: false, message: '记录不存在' });
  if (commission.status !== 'pending') return res.status(400).json({ success: false, message: '仅待审核状态可审核通过' });
  commission.status = 'confirmed';
  await commission.save();
  res.json({ success: true, data: commission, message: '已审核通过，待打款' });
});

// PATCH /api/admin/commissions/:id/reject — 审核驳回（pending → cancelled）
router.patch('/commissions/:id/reject', adminAuth, async (req, res) => {
  if (!COMMISSION_ADMIN_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '无权限审核佣金' });
  }
  const { reason } = req.body;
  const commission = await Commission.findById(req.params.id);
  if (!commission) return res.status(404).json({ success: false, message: '记录不存在' });
  if (commission.status !== 'pending') return res.status(400).json({ success: false, message: '仅待审核状态可驳回' });
  commission.status = 'cancelled';
  if (reason) commission.remark = reason;
  await commission.save();
  res.json({ success: true, data: commission, message: '已驳回' });
});

// PATCH /api/admin/commissions/:id/pay — 确认打款（confirmed → paid）
router.patch('/commissions/:id/pay', adminAuth, async (req, res) => {
  if (!COMMISSION_ADMIN_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '无权限操作打款' });
  }
  const commission = await Commission.findById(req.params.id);
  if (!commission) return res.status(404).json({ success: false, message: '记录不存在' });
  if (commission.status !== 'confirmed') return res.status(400).json({ success: false, message: '仅已审核通过状态可打款' });
  commission.status = 'paid';
  commission.paidAt = new Date();
  await commission.save();
  res.json({ success: true, data: commission, message: '已确认打款' });
});

// PATCH /api/admin/commissions/batch-pay — 批量打款（对多条confirmed记录一次性打款）
router.patch('/commissions/batch-pay', adminAuth, async (req, res) => {
  if (!COMMISSION_ADMIN_ROLES.includes(req.admin.role)) {
    return res.status(403).json({ success: false, message: '无权限操作打款' });
  }
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ success: false, message: '请选择要打款的记录' });
  const result = await Commission.updateMany(
    { _id: { $in: ids }, status: 'confirmed' },
    { $set: { status: 'paid', paidAt: new Date() } }
  );
  res.json({ success: true, message: `已批量打款 ${result.modifiedCount} 条` });
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
  const list = await DynamicQuestionnaire.find({ deletedAt: null }).sort({ sortOrder: 1, createdAt: -1 })
    .populate('createdBy', 'name').lean();
  const withCounts = await Promise.all(list.map(async q => {
    const count = await QuestionnaireResponse.countDocuments({ questionnaire: q._id });
    return { ...q, questions: normalizeQuestions(q.questions), responseCount: count };
  }));
  res.json({ success: true, data: withCounts });
});

// GET /api/admin/archive-fields — 健康档案字段清单（问卷构建器「对应档案字段」下拉用）
router.get('/archive-fields', adminAuth, (req, res) => {
  const { groupedArchiveFields } = require('../config/archiveFields');
  res.json({ success: true, data: groupedArchiveFields() });
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
  if (questions !== undefined && (!Array.isArray(questions) || questions.length === 0)) {
    return res.status(400).json({ success: false, message: '问卷至少需要包含一道题目' });
  }
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
  // 软删除：保留问卷与历史答卷数据（答卷只存题目id不存题干快照，物理删除会导致历史答卷无法追溯题干），
  // 置 deletedAt 后从所有列表接口中排除，效果等同于删除，但不影响已产生的推送记录/健康档案导入历史
  const q = await DynamicQuestionnaire.findByIdAndUpdate(req.params.id, { deletedAt: new Date() }, { new: true });
  if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });
  res.json({ success: true, message: '问卷已删除' });
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
  const { password, name, role, title, department, region, phone, teamId } = req.body;
  let { username } = req.body;
  if (!phone || !password || !name || !role) {
    return res.status(400).json({ success: false, message: '手机号码、密码、姓名、角色不能为空' });
  }
  if (!STAFF_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '角色无效' });
  }
  // 手机号唯一检查
  const existingPhone = await Admin.findOne({ phone });
  if (existingPhone) return res.status(400).json({ success: false, message: '该手机号已被其他员工使用' });
  // 用户名：不填则自动使用手机号
  if (!username) username = phone;
  const existing = await Admin.findOne({ username });
  if (existing) {
    // 用户名与手机号相同时已被占用，附加随机后缀
    username = `${phone}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const staff = await Admin.create({ username, password, name, role, title: title || '', department: department || '', region: region || '', phone, teamId: teamId || null });
  res.json({ success: true, data: { _id: staff._id, username: staff.username, name: staff.name, role: staff.role } });
});

// PUT /api/admin/staff/:id — 更新医护账号信息
router.put('/staff/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可修改医护账号' });
  }
  const { name, role, title, department, region, password, phone, teamId, mentorOfTeamId } = req.body;
  const update = {};
  if (name) update.name = name;
  if (role && STAFF_ROLES.includes(role)) update.role = role;
  if (title !== undefined) update.title = title;
  if (department !== undefined) update.department = department;
  if (region !== undefined) update.region = region;
  if (phone !== undefined) update.phone = phone;
  if (teamId !== undefined) update.teamId = teamId || null;

  const staff = await Admin.findById(req.params.id);
  if (!staff || !STAFF_ROLES.includes(staff.role)) {
    return res.status(404).json({ success: false, message: '医护账号不存在' });
  }
  if (phone && phone !== staff.phone) {
    const dup = await Admin.findOne({ phone, _id: { $ne: staff._id } });
    if (dup) return res.status(400).json({ success: false, message: '该手机号已被其他员工使用' });
  }
  staff.set(update);
  if (password) staff.password = password; // triggers bcrypt pre-save
  await staff.save();

  // 在员工侧直接设/解除"团队负责人(导师)"：mentorOfTeamId 有值则把该团队 mentor 设为此员工；
  // 传空字符串则解除该员工当前担任的所有团队导师职务。
  if (mentorOfTeamId !== undefined) {
    if (mentorOfTeamId) {
      // 一个团队只有一个导师：先把此员工原本负责的其它团队导师清掉，再设到目标团队
      await Team.updateMany({ mentorId: staff._id, _id: { $ne: mentorOfTeamId } }, { $set: { mentorId: null } });
      await Team.findByIdAndUpdate(mentorOfTeamId, { mentorId: staff._id });
    } else {
      await Team.updateMany({ mentorId: staff._id }, { $set: { mentorId: null } });
    }
  }

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

// ── 机构/租户管理（SaaS：平台超管跨机构运营）─────────────────────────
const Tenant = require('../models/Tenant');
const { runWithoutTenantScope } = require('../utils/tenantScope');

// 仅平台超管可管理机构（跨租户运营方）
function requirePlatformSuper(req, res, next) {
  if (req.admin.role !== 'platformSuper') {
    return res.status(403).json({ success: false, message: '仅平台超管可管理机构' });
  }
  next();
}

// GET /api/admin/tenants — 机构列表（含每个机构的员工数/客户数）
router.get('/tenants', adminAuth, requirePlatformSuper, async (req, res) => {
  // 平台超管本就 BYPASS 隔离，这里直接查全部机构
  const tenants = await Tenant.find({}).sort({ createdAt: -1 }).lean();
  const [staffAgg, userAgg] = await Promise.all([
    runWithoutTenantScope(() => Admin.aggregate([{ $match: { tenantId: { $ne: null } } }, { $group: { _id: '$tenantId', c: { $sum: 1 } } }])),
    runWithoutTenantScope(() => User.aggregate([{ $match: { tenantId: { $ne: null } } }, { $group: { _id: '$tenantId', c: { $sum: 1 } } }])),
  ]);
  const staffMap = Object.fromEntries(staffAgg.map(x => [String(x._id), x.c]));
  const userMap = Object.fromEntries(userAgg.map(x => [String(x._id), x.c]));
  tenants.forEach(t => { t.staffCount = staffMap[String(t._id)] || 0; t.userCount = userMap[String(t._id)] || 0; });
  res.json({ success: true, data: tenants });
});

// POST /api/admin/tenants — 新建机构，并为其创建一个 superadmin 账号（归属该机构）
router.post('/tenants', adminAuth, requirePlatformSuper, async (req, res) => {
  const { code, name, slogan, logo, themeColor, adminUsername, adminPassword } = req.body;
  if (!code || !name) return res.status(400).json({ success: false, message: '机构标识和名称为必填项' });
  const dup = await Tenant.findOne({ code });
  if (dup) return res.status(400).json({ success: false, message: '该机构标识已存在' });
  const tenant = await Tenant.create({ code, name, slogan: slogan || '', logo: logo || '', themeColor: themeColor || '#1E6B50' });

  // 为新机构建一个 superadmin，否则该机构无人能登录管理
  let createdAdmin = null;
  if (adminUsername && adminPassword) {
    const exists = await runWithoutTenantScope(() => Admin.findOne({ username: adminUsername }));
    if (exists) {
      await tenant.deleteOne();
      return res.status(400).json({ success: false, message: '管理员用户名已被占用，机构创建已回滚' });
    }
    createdAdmin = await Admin.create({
      username: adminUsername, password: adminPassword, name: `${name}管理员`,
      role: 'superadmin', phone: `t_${code}`, tenantId: tenant._id,
    });
  }
  res.json({ success: true, data: { tenant, adminId: createdAdmin?._id || null }, message: '机构创建成功' });
});

// PUT /api/admin/tenants/:id — 更新机构信息
router.put('/tenants/:id', adminAuth, requirePlatformSuper, async (req, res) => {
  const { name, slogan, logo, themeColor, status, note } = req.body;
  const update = {};
  ['name', 'slogan', 'logo', 'themeColor', 'status', 'note'].forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  const tenant = await Tenant.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!tenant) return res.status(404).json({ success: false, message: '机构不存在' });
  res.json({ success: true, data: tenant, message: '机构信息已更新' });
});

// DELETE /api/admin/tenants/:id — 删除机构（有员工/客户时拒绝，避免误删数据）
router.delete('/tenants/:id', adminAuth, requirePlatformSuper, async (req, res) => {
  const [staffCount, userCount] = await Promise.all([
    runWithoutTenantScope(() => Admin.countDocuments({ tenantId: req.params.id })),
    runWithoutTenantScope(() => User.countDocuments({ tenantId: req.params.id })),
  ]);
  if (staffCount > 0 || userCount > 0) {
    return res.status(400).json({ success: false, message: `该机构下还有 ${staffCount} 名员工、${userCount} 名客户，请先迁移或清理后再删除` });
  }
  const tenant = await Tenant.findByIdAndDelete(req.params.id);
  if (!tenant) return res.status(404).json({ success: false, message: '机构不存在' });
  res.json({ success: true, message: '机构已删除' });
});

// ── 团队管理（导师可查看全团队客户档案）──────────────────────────────
const Team = require('../models/Team');

// GET /api/admin/teams — 团队列表（带导师姓名 + 成员数）
router.get('/teams', adminAuth, async (req, res) => {
  const teams = await Team.find({}).sort({ sortOrder: 1, createdAt: -1 }).populate('mentorId', 'name role title').lean();
  const counts = await Admin.aggregate([
    { $match: { teamId: { $ne: null } } },
    { $group: { _id: '$teamId', count: { $sum: 1 } } },
  ]);
  const countMap = Object.fromEntries(counts.map(c => [String(c._id), c.count]));
  teams.forEach(t => { t.memberCount = countMap[String(t._id)] || 0; });
  res.json({ success: true, data: teams });
});

// POST /api/admin/teams — 新建团队
router.post('/teams', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅超级管理员可管理团队' });
  const { name, mentorId, note, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '团队名称不能为空' });
  const team = await Team.create({ name, mentorId: mentorId || null, note: note || '', sortOrder: sortOrder || 0 });
  res.json({ success: true, data: team, message: '团队创建成功' });
});

// PUT /api/admin/teams/:id — 更新团队
router.put('/teams/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅超级管理员可管理团队' });
  const { name, mentorId, note, status, sortOrder } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (mentorId !== undefined) update.mentorId = mentorId || null;
  if (note !== undefined) update.note = note;
  if (status !== undefined) update.status = status;
  if (sortOrder !== undefined) update.sortOrder = sortOrder;
  const team = await Team.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!team) return res.status(404).json({ success: false, message: '团队不存在' });
  res.json({ success: true, data: team, message: '团队更新成功' });
});

// DELETE /api/admin/teams/:id — 删除团队（成员的 teamId 一并清空）
router.delete('/teams/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅超级管理员可管理团队' });
  const team = await Team.findById(req.params.id);
  if (!team) return res.status(404).json({ success: false, message: '团队不存在' });
  await Admin.updateMany({ teamId: team._id }, { $set: { teamId: null } });
  await team.deleteOne();
  res.json({ success: true, message: '团队已删除，成员归属已清空' });
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

// ── 图片上传 ──────────────────────────────────────────────────────

// POST /api/admin/upload/image
// 返回相对路径而非绝对URL——历史遗留代码曾写死 http://121.40.156.39 绝对地址，导致在
// https://jiaycare.com 页面里加载图片被浏览器 Mixed Content 策略拦截（HTTPS页面不允许加载HTTP资源），
// 图片请求被静默阻止、控制台报错但界面上只是安静地不显示。改成相对路径由前端自行拼接当前协议+域名。
// 2026-07-07修复：multer的fileFilter拒绝非图片文件时用cb(new Error(...))报错，这个错误此前没被
// 路由捕获，一路冒泡到全局错误处理器变成500"服务器内部错误"，用户完全看不出是文件格式问题。
// 现在用中间件包一层，把multer相关错误转成400+清晰提示（如iPhone拍照HEIC格式、非常规MIME类型等场景）。
router.post('/upload/image', adminAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || '文件上传失败，请检查文件格式是否为常见图片格式（jpg/png/webp等）' });
    next();
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '未收到文件' });
  const url = `/api/uploads/${req.file.filename}`;
  res.json({ success: true, data: { url } });
});

// ── 商城产品分类管理 ──────────────────────────────────────────────

const DEFAULT_PRODUCT_CATEGORIES = ['检测套餐', '营养补充', '咨询服务', '上门服务', '健康课程', '中医调理'];

async function getProductCategories() {
  let cats = await ProductCategory.find().sort({ sortOrder: 1, createdAt: 1 });
  if (cats.length === 0) {
    await ProductCategory.insertMany(DEFAULT_PRODUCT_CATEGORIES.map((name, i) => ({ name, sortOrder: i })));
    cats = await ProductCategory.find().sort({ sortOrder: 1 });
  }
  return cats;
}

// GET /api/admin/product-categories
router.get('/product-categories', adminAuth, async (req, res) => {
  const cats = await getProductCategories();
  res.json({ success: true, data: cats });
});

// POST /api/admin/product-categories
router.post('/product-categories', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: '分类名称不能为空' });
  const existing = await ProductCategory.findOne({ name: name.trim() });
  if (existing) return res.status(400).json({ success: false, message: '该分类名称已存在' });
  const count = await ProductCategory.countDocuments();
  const cat = await ProductCategory.create({ name: name.trim(), sortOrder: count * 10 });
  res.json({ success: true, data: cat, message: '分类创建成功' });
});

// DELETE /api/admin/product-categories/:id
router.delete('/product-categories/:id', adminAuth, async (req, res) => {
  await ProductCategory.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '分类已删除' });
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
  const { name, subtitle, images, originalPrice, servicePrices, memberPrices, category, sortOrder, features, description, stock, status, performanceRule, servicePerformerRoles } = req.body;
  if (!name || !category || originalPrice === undefined) {
    return res.status(400).json({ success: false, message: '名称、分类、原价为必填项' });
  }
  const product = await Product.create({
    name, subtitle: subtitle || '', images: images || [],
    originalPrice, servicePrices: servicePrices || [], memberPrices: memberPrices || {},
    category, sortOrder: sortOrder ?? 999, features: features || [],
    description: description || '', stock: stock ?? 0, status: status || 'off',
    performanceRule: performanceRule || undefined,
    servicePerformerRoles: servicePerformerRoles || [],
  });
  res.json({ success: true, data: product, message: '产品创建成功' });
});

// PUT /api/admin/products/:id
router.put('/products/:id', adminAuth, async (req, res) => {
  const { name, subtitle, images, originalPrice, servicePrices, memberPrices, category, sortOrder, features, description, stock, status, performanceRule, servicePerformerRoles } = req.body;
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { name, subtitle, images, originalPrice, servicePrices, memberPrices, category, sortOrder, features, description, stock, status, performanceRule, servicePerformerRoles: servicePerformerRoles || [] },
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

// ── 合作伙伴管理 ──────────────────────────────────────────────────

// GET /api/admin/partners
router.get('/partners', adminAuth, async (req, res) => {
  const { name, category, status } = req.query;
  const filter = {};
  if (name) filter.name = new RegExp(name, 'i');
  if (category) filter.category = category;
  if (status) filter.status = status;
  const partners = await Partner.find(filter).sort({ sortOrder: 1, createdAt: -1 });
  res.json({ success: true, data: partners });
});

// POST /api/admin/partners
router.post('/partners', adminAuth, async (req, res) => {
  const { name, category, logo, description, contactPhone, sortOrder, status } = req.body;
  if (!name || !category) return res.status(400).json({ success: false, message: '名称、分类为必填项' });
  const partner = await Partner.create({
    name, category, logo: logo || '', description: description || '',
    contactPhone: contactPhone || '', sortOrder: sortOrder ?? 999, status: status || 'on',
  });
  res.json({ success: true, data: partner, message: '合作伙伴创建成功' });
});

// PUT /api/admin/partners/:id
router.put('/partners/:id', adminAuth, async (req, res) => {
  const { name, category, logo, description, contactPhone, sortOrder, status } = req.body;
  const partner = await Partner.findByIdAndUpdate(
    req.params.id,
    { name, category, logo, description, contactPhone, sortOrder, status },
    { new: true }
  );
  if (!partner) return res.status(404).json({ success: false, message: '合作伙伴不存在' });
  res.json({ success: true, data: partner, message: '合作伙伴更新成功' });
});

// PATCH /api/admin/partners/:id/toggle
router.patch('/partners/:id/toggle', adminAuth, async (req, res) => {
  const partner = await Partner.findById(req.params.id);
  if (!partner) return res.status(404).json({ success: false, message: '合作伙伴不存在' });
  partner.status = partner.status === 'on' ? 'off' : 'on';
  await partner.save();
  res.json({ success: true, data: partner, message: partner.status === 'on' ? '合作伙伴已上架' : '合作伙伴已下架' });
});

// DELETE /api/admin/partners/:id（同时删除该合作伙伴名下所有权益）
router.delete('/partners/:id', adminAuth, async (req, res) => {
  const partner = await Partner.findByIdAndDelete(req.params.id);
  if (!partner) return res.status(404).json({ success: false, message: '合作伙伴不存在' });
  await PartnerBenefit.deleteMany({ partner: req.params.id });
  res.json({ success: true, message: '合作伙伴及其权益已删除' });
});

// ── 合作伙伴权益管理 ──────────────────────────────────────────────

// GET /api/admin/partner-benefits?partnerId=
router.get('/partner-benefits', adminAuth, async (req, res) => {
  const { partnerId, status } = req.query;
  const filter = {};
  if (partnerId) filter.partner = partnerId;
  if (status) filter.status = status;
  const benefits = await PartnerBenefit.find(filter).populate('partner', 'name category logo').sort({ sortOrder: 1, createdAt: -1 });
  res.json({ success: true, data: benefits });
});

// POST /api/admin/partner-benefits
router.post('/partner-benefits', adminAuth, async (req, res) => {
  const { partner, title, subtitle, images, description, usageGuide, visibleMemberTypes, sortOrder, status } = req.body;
  if (!partner || !title) return res.status(400).json({ success: false, message: '合作伙伴、权益标题为必填项' });
  const benefit = await PartnerBenefit.create({
    partner, title, subtitle: subtitle || '', images: images || [],
    description: description || '', usageGuide: usageGuide || '',
    visibleMemberTypes: visibleMemberTypes || [], sortOrder: sortOrder ?? 999, status: status || 'on',
  });
  res.json({ success: true, data: benefit, message: '权益创建成功' });
});

// PUT /api/admin/partner-benefits/:id
router.put('/partner-benefits/:id', adminAuth, async (req, res) => {
  const { partner, title, subtitle, images, description, usageGuide, visibleMemberTypes, sortOrder, status } = req.body;
  const benefit = await PartnerBenefit.findByIdAndUpdate(
    req.params.id,
    { partner, title, subtitle, images, description, usageGuide, visibleMemberTypes, sortOrder, status },
    { new: true }
  );
  if (!benefit) return res.status(404).json({ success: false, message: '权益不存在' });
  res.json({ success: true, data: benefit, message: '权益更新成功' });
});

// PATCH /api/admin/partner-benefits/:id/toggle
router.patch('/partner-benefits/:id/toggle', adminAuth, async (req, res) => {
  const benefit = await PartnerBenefit.findById(req.params.id);
  if (!benefit) return res.status(404).json({ success: false, message: '权益不存在' });
  benefit.status = benefit.status === 'on' ? 'off' : 'on';
  await benefit.save();
  res.json({ success: true, data: benefit, message: benefit.status === 'on' ? '权益已上架' : '权益已下架' });
});

// DELETE /api/admin/partner-benefits/:id
router.delete('/partner-benefits/:id', adminAuth, async (req, res) => {
  const benefit = await PartnerBenefit.findByIdAndDelete(req.params.id);
  if (!benefit) return res.status(404).json({ success: false, message: '权益不存在' });
  res.json({ success: true, message: '权益已删除' });
});

// ── 企业客户管理（B2B2C）──────────────────────────────────────────
// 仅超级管理员可维护；企业HR自身数据通过 /api/enterprise-hr 独立只读接口访问，不复用此处

// GET /api/admin/enterprises
router.get('/enterprises', adminAuth, async (req, res) => {
  const { name, status } = req.query;
  const filter = {};
  if (name) filter.name = new RegExp(name, 'i');
  if (status) filter.status = status;
  const enterprises = await Enterprise.find(filter).sort({ createdAt: -1 });
  // 附带每个企业当前已分配的员工数
  const withSeatsUsed = await Promise.all(enterprises.map(async (e) => {
    const seatsUsed = await User.countDocuments({ enterpriseId: e._id });
    return { ...e.toObject(), seatsUsed };
  }));
  res.json({ success: true, data: withSeatsUsed });
});

// POST /api/admin/enterprises
router.post('/enterprises', adminAuth, async (req, res) => {
  const { name, creditCode, contactName, contactPhone, contactEmail, logo, contractStartAt, contractEndAt, seatsTotal, packageType, status, note } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '企业名称为必填项' });
  const enterprise = await Enterprise.create({
    name, creditCode: creditCode || '', contactName: contactName || '', contactPhone: contactPhone || '',
    contactEmail: contactEmail || '', logo: logo || '', contractStartAt: contractStartAt || null,
    contractEndAt: contractEndAt || null, seatsTotal: seatsTotal ?? 0, packageType: packageType || '',
    status: status || 'active', note: note || '',
  });
  res.json({ success: true, data: enterprise, message: '企业客户创建成功' });
});

// PUT /api/admin/enterprises/:id
router.put('/enterprises/:id', adminAuth, async (req, res) => {
  const { name, creditCode, contactName, contactPhone, contactEmail, logo, contractStartAt, contractEndAt, seatsTotal, packageType, status, note } = req.body;
  const enterprise = await Enterprise.findByIdAndUpdate(
    req.params.id,
    { name, creditCode, contactName, contactPhone, contactEmail, logo, contractStartAt, contractEndAt, seatsTotal, packageType, status, note },
    { new: true }
  );
  if (!enterprise) return res.status(404).json({ success: false, message: '企业不存在' });
  res.json({ success: true, data: enterprise, message: '企业信息已更新' });
});

// DELETE /api/admin/enterprises/:id
router.delete('/enterprises/:id', adminAuth, async (req, res) => {
  const seatsUsed = await User.countDocuments({ enterpriseId: req.params.id });
  if (seatsUsed > 0) {
    return res.status(400).json({ success: false, message: `该企业名下还有 ${seatsUsed} 名员工，请先解除关联再删除` });
  }
  const enterprise = await Enterprise.findByIdAndDelete(req.params.id);
  if (!enterprise) return res.status(404).json({ success: false, message: '企业不存在' });
  await Admin.deleteMany({ enterpriseId: req.params.id, role: 'enterprise_hr' }); // 一并清理HR账号
  res.json({ success: true, message: '企业客户已删除' });
});

// PUT /api/admin/enterprises/:id/hr-data —— 录入/更新某年度的HR看板数据（体检/保险/费用，手工录入）
router.put('/enterprises/:id/hr-data', adminAuth, async (req, res) => {
  if (!['superadmin', 'platformSuper'].includes(req.admin.role)) return res.status(403).json({ success: false, message: '仅超级管理员可录入企业财务数据' });
  const { year, data } = req.body;
  if (!year) return res.status(400).json({ success: false, message: '请指定年度' });
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return res.status(404).json({ success: false, message: '企业不存在' });

  const num = (v) => (v === '' || v === null || v === undefined ? 0 : Number(v) || 0);
  const clean = {
    examOrg:       (data?.examOrg || '').trim(),
    examCount:     num(data?.examCount),
    examUnitPrice: num(data?.examUnitPrice),  // 保留兼容：总体客单价
    // 客单价按人群细分（男性/已婚女性/未婚女性）
    examUnitPriceMale:          num(data?.examUnitPriceMale),
    examUnitPriceMarriedFemale: num(data?.examUnitPriceMarriedFemale),
    examUnitPriceSingleFemale:  num(data?.examUnitPriceSingleFemale),
    examTotal:     num(data?.examTotal),
    insurerName:   (data?.insurerName || '').trim(),
    insuredCount:  num(data?.insuredCount),   // 保留兼容：参保总人数
    // 参保人数按人群细分（高管/家属/孩子）
    insuredExecCount:   num(data?.insuredExecCount),
    insuredFamilyCount: num(data?.insuredFamilyCount),
    insuredChildCount:  num(data?.insuredChildCount),
    insuredAmount: num(data?.insuredAmount),
    healthMgmtFee: num(data?.healthMgmtFee),
    // 付费健康管理服务清单：每项带启动状态，供企业看清过去一年提供了哪些服务、实际启动情况
    otherServices: Array.isArray(data?.otherServices)
      ? data.otherServices.filter(s => (s?.name || '').trim()).map(s => ({
          name: s.name.trim(),
          frequency: (s?.frequency || '').trim(),   // 服务频次/频率，如"每季度1次""全年4场"
          detail: (s?.detail || '').trim(),   // 具体服务内容说明
        }))
      : [],
    // 企业健康基金：充值流水（区分企业自有/平台赠送）+ 已用金额；总额/余额由系统算
    healthFund: (() => {
      const transactions = Array.isArray(data?.healthFund?.transactions)
        ? data.healthFund.transactions
            .filter(t => num(t?.amount) > 0)
            .map(t => ({
              source: ['企业自有', '平台赠送'].includes(t?.source) ? t.source : '企业自有',
              amount: num(t.amount),
              date: (t?.date || '').trim(),
              note: (t?.note || '').trim(),
            }))
        : [];
      const total = transactions.reduce((sum, t) => sum + t.amount, 0);
      const used = num(data?.healthFund?.used);
      return { transactions, used, total, balance: total - used };  // 总额-已用=余额
    })(),
  };
  // Mixed 字段整体替换该年度键（findByIdAndUpdate 对 Mixed 子键需用 markModified，这里直接读改存）
  const byYear = { ...(enterprise.hrDataByYear || {}) };
  byYear[String(year)] = clean;
  enterprise.hrDataByYear = byYear;
  enterprise.markModified('hrDataByYear');
  await enterprise.save();
  res.json({ success: true, data: enterprise.hrDataByYear, message: `${year}年度数据已保存` });
});

// GET /api/admin/enterprises/:id/employees —— 该企业下已关联的员工列表
router.get('/enterprises/:id/employees', adminAuth, async (req, res) => {
  const employees = await User.find({ enterpriseId: req.params.id })
    .select('name phone age gender healthScore onboardingCompleted createdAt')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: employees });
});

// PATCH /api/admin/enterprises/:id/employees —— 批量将员工关联到该企业（body: { userIds: [] }）
router.patch('/enterprises/:id/employees', adminAuth, async (req, res) => {
  const { userIds } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ success: false, message: '请选择要关联的员工' });
  }
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return res.status(404).json({ success: false, message: '企业不存在' });
  const seatsUsed = await User.countDocuments({ enterpriseId: req.params.id });
  if (enterprise.seatsTotal > 0 && seatsUsed + userIds.length > enterprise.seatsTotal) {
    return res.status(400).json({ success: false, message: `超出采购名额（剩余 ${Math.max(enterprise.seatsTotal - seatsUsed, 0)} 个）` });
  }
  await User.updateMany({ _id: { $in: userIds } }, { enterpriseId: req.params.id });
  res.json({ success: true, message: `已关联 ${userIds.length} 名员工` });
});

// DELETE /api/admin/enterprises/:id/employees/:userId —— 解除某员工与企业的关联
router.delete('/enterprises/:id/employees/:userId', adminAuth, async (req, res) => {
  await User.updateOne({ _id: req.params.userId, enterpriseId: req.params.id }, { enterpriseId: null });
  res.json({ success: true, message: '已解除关联' });
});

// GET /api/admin/enterprises/:id/hr-accounts —— 该企业的HR账号列表
router.get('/enterprises/:id/hr-accounts', adminAuth, async (req, res) => {
  const accounts = await Admin.find({ enterpriseId: req.params.id, role: 'enterprise_hr' }).select('-password');
  res.json({ success: true, data: accounts });
});

// POST /api/admin/enterprises/:id/hr-accounts —— 为该企业创建HR账号
router.post('/enterprises/:id/hr-accounts', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可创建企业HR账号' });
  }
  const { username, password, name, phone } = req.body;
  if (!password || !name) return res.status(400).json({ success: false, message: '密码、姓名不能为空' });
  const enterprise = await Enterprise.findById(req.params.id);
  if (!enterprise) return res.status(404).json({ success: false, message: '企业不存在' });
  const finalUsername = username || `hr_${Date.now().toString(36)}`;
  const usernameExists = await Admin.findOne({ username: finalUsername });
  if (usernameExists) return res.status(400).json({ success: false, message: '用户名已存在' });
  const hr = await Admin.create({
    username: finalUsername, password, name, phone: phone || '',
    role: 'enterprise_hr', enterpriseId: req.params.id, staffStatus: 'active',
  });
  res.json({ success: true, data: { _id: hr._id, username: hr.username, name: hr.name }, message: 'HR账号已创建' });
});

// DELETE /api/admin/hr-accounts/:id —— 删除HR账号
router.delete('/hr-accounts/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可删除' });
  }
  const hr = await Admin.findOneAndDelete({ _id: req.params.id, role: 'enterprise_hr' });
  if (!hr) return res.status(404).json({ success: false, message: 'HR账号不存在' });
  res.json({ success: true, message: 'HR账号已删除' });
});

// ── 健康方案模板管理 ──────────────────────────────────────────────

// GET /api/admin/plan-templates?type=
router.get('/plan-templates', adminAuth, async (req, res) => {
  const { type, name } = req.query;
  const filter = {};
  if (type) filter.type = type;
  if (name) filter.name = new RegExp(name, 'i');
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

// GET /api/admin/followup-plans — 随访方案列表（供健康管理方案模板选用）
router.get('/followup-plans', adminAuth, async (req, res) => {
  try {
    const plans = await FollowUpPlan.find({ status: 'active' }).sort({ name: 1 }).lean();
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 系统配置 / 健康评分权重 ─────────────────────────────────────
const DEFAULT_SCORING = {
  base: 60,
  perRecord: 2,
  maxRecordBonus: 20,
  taskRateWeight: 0.1,
  dangerPenalty: 10,
  warningPenalty: 5,
};

// GET /api/admin/system-config/scoring
router.get('/system-config/scoring', adminAuth, async (req, res) => {
  try {
    const cfg = await SystemConfig.findOne({ key: 'health_scoring' });
    res.json({ success: true, data: cfg ? cfg.value : DEFAULT_SCORING });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/admin/system-config/daily-care —— AI每日健康关怀开关（默认开启）
router.get('/system-config/daily-care', adminAuth, async (req, res) => {
  try {
    const cfg = await SystemConfig.findOne({ key: 'dailyCare' });
    res.json({ success: true, data: cfg ? cfg.value : { enabled: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/system-config/daily-care —— 开关AI每日关怀
router.put('/system-config/daily-care', adminAuth, async (req, res) => {
  try {
    const value = { enabled: req.body.enabled !== false };
    await SystemConfig.findOneAndUpdate(
      { key: 'dailyCare' },
      { key: 'dailyCare', value, label: 'AI每日健康关怀开关' },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: value.enabled ? '已开启每日健康关怀' : '已关闭每日健康关怀' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/admin/system-config/scoring
router.put('/system-config/scoring', adminAuth, async (req, res) => {
  try {
    const value = { ...DEFAULT_SCORING, ...req.body };
    await SystemConfig.findOneAndUpdate(
      { key: 'health_scoring' },
      { key: 'health_scoring', value, label: '健康评分权重配置' },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: '配置已保存' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 年度健康管理方案 ────────────────────────────────────────────────────

// GET /api/admin/annual-plans — 列出所有年度管理方案（供方案模板页展示）
router.get('/annual-plans', adminAuth, async (req, res) => {
  try {
    const { name } = req.query;
    const filter = {};
    if (name) {
      // patientId 是关联字段，先按姓名/手机号查出匹配的用户ID再过滤
      const matchedUsers = await User.find({
        $or: [{ name: new RegExp(name, 'i') }, { phone: new RegExp(name, 'i') }],
      }).select('_id');
      filter.patientId = { $in: matchedUsers.map(u => u._id) };
    }
    const plans = await AnnualPlan.find(filter)
      .sort({ updatedAt: -1 })
      .limit(200)
      .populate('patientId', 'name phone');
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/patients/:id/annual-plan', adminAuth, async (req, res) => {
  try {
    const { year } = req.query;
    const query = { patientId: req.params.id };
    if (year) query.year = parseInt(year);
    const plan = await AnnualPlan.findOne(query).sort({ year: -1 });
    res.json({ success: true, data: plan || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/patients/:id/annual-plan', adminAuth, async (req, res) => {
  try {
    const { planType, moduleData, notes, year } = req.body;
    const targetYear = year || new Date().getFullYear();
    const plan = await AnnualPlan.findOneAndUpdate(
      { patientId: req.params.id, year: targetYear },
      { planType, moduleData: moduleData || {}, notes: notes || '', createdBy: req.admin._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 年度方案模板（无需绑定会员） ────────────────────────────────────────
router.get('/annual-plan-templates', adminAuth, async (req, res) => {
  try {
    const templates = await AnnualPlanTemplate.find().sort({ createdAt: -1 });
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/annual-plan-templates', adminAuth, async (req, res) => {
  try {
    const { name, planType, moduleData, notes, year } = req.body;
    const template = await AnnualPlanTemplate.create({
      name: name || '年度管理方案模板',
      planType, moduleData: moduleData || {}, notes: notes || '',
      year: year || new Date().getFullYear(),
      createdBy: req.admin._id,
    });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/annual-plan-templates/:id', adminAuth, async (req, res) => {
  try {
    const template = await AnnualPlanTemplate.findById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/annual-plan-templates/:id', adminAuth, async (req, res) => {
  try {
    const { name, planType, moduleData, notes, year } = req.body;
    const template = await AnnualPlanTemplate.findByIdAndUpdate(
      req.params.id,
      { name, planType, moduleData: moduleData || {}, notes: notes || '', year: year || new Date().getFullYear(), createdBy: req.admin._id },
      { new: true }
    );
    if (!template) return res.status(404).json({ success: false, message: '模板不存在' });
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
