const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const HealthRecord = require('../models/HealthRecord');
const MedicalReport = require('../models/MedicalReport');
const HealthPlan = require('../models/HealthPlan');
const KnowledgeItem = require('../models/KnowledgeItem');
const PushRecord = require('../models/PushRecord');
const Commission = require('../models/Commission');
const ServiceRecord = require('../models/ServiceRecord');
const Order = require('../models/Order');
const GiftRecord = require('../models/GiftRecord');
const Referral = require('../models/Referral');
const { DynamicQuestionnaire } = require('../models/DynamicQuestionnaire');
const staffAuth = require('../middleware/staffAuth');
const router = express.Router();

// 医护端角色标签
const ROLE_LABEL = {
  familyDoctor:    '家庭医生',
  nutritionist:    '营养师',
  healthManager:   '健管专员',
  medicalAssistant:'就医专员',
  psychologist:    '心理咨询师',
  rehabSpecialist: '运动复健师',
  tcmDoctor:       '中医师',
  specialist:      '专科医师',
  healthPlanner:   '健康规划师',
  superadmin:      '超级管理员',
};

// ── POST /api/staff/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: '用户名和密码不能为空' });
  }

  const STAFF_ROLES = [
    'superadmin',
    'familyDoctor', 'nutritionist', 'healthManager',
    'medicalAssistant', 'psychologist', 'rehabSpecialist',
    'tcmDoctor', 'specialist', 'healthPlanner',
  ];

  const admin = await Admin.findOne({ username });
  if (!admin || !(await admin.comparePassword(password))) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  if (!STAFF_ROLES.includes(admin.role)) {
    return res.status(403).json({ success: false, message: '该账号无医护端权限' });
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
      staff: {
        _id: admin._id,
        name: admin.name,
        role: admin.role,
        roleLabel: ROLE_LABEL[admin.role] || admin.role,
        title: admin.title,
        department: admin.department,
        avatar: admin.avatar,
      },
    },
  });
});

// ── GET /api/staff/me ─────────────────────────────────────────────
router.get('/me', staffAuth, async (req, res) => {
  const s = req.staff;
  res.json({
    success: true,
    data: {
      _id: s._id,
      name: s.name,
      role: s.role,
      roleLabel: ROLE_LABEL[s.role] || s.role,
      title: s.title,
      department: s.department,
      avatar: s.avatar,
      region: s.region,
    },
  });
});

// ── GET /api/staff/patients ───────────────────────────────────────
// 查询分配给当前医护人员的患者列表
router.get('/patients', staffAuth, async (req, res) => {
  const { page = 1, limit = 20, search = '', disease = '', type = '' } = req.query;
  const staff = req.staff;

  // 构建过滤条件：根据角色匹配分配字段
  const assignFilter = {};
  if (staff.role === 'familyDoctor') {
    assignFilter.assignedFamilyDoctor = staff._id;
  } else if (staff.role === 'healthManager') {
    assignFilter.assignedHealthManager = staff._id;
  } else if (staff.role === 'superadmin') {
    // 超管可以看所有患者，不过滤
  } else {
    // 其他角色默认看分配给健管专员字段中有自己的患者
    assignFilter.assignedHealthManager = staff._id;
  }

  const filter = { ...assignFilter };
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  if (disease) {
    filter.chronicDiseases = disease;
  }
  if (type) {
    filter.patientType = type;
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [patients, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('name phone gender age height weight healthScore servicePackage serviceExpiry chronicDiseases patientType assignedHealthManager assignedFamilyDoctor source createdAt contactPhone')
      .populate('assignedHealthManager', 'name title')
      .populate('assignedFamilyDoctor', 'name title'),
    User.countDocuments(filter),
  ]);

  res.json({ success: true, data: { patients, total, page: Number(page), limit: Number(limit) } });
});

// ── POST /api/staff/patients ──────────────────────────────────────
// 新建患者（录入）
router.post('/patients', staffAuth, async (req, res) => {
  const staff = req.staff;
  const {
    name, phone, gender, age, height, weight,
    chronicDiseases, patientType, source, remark,
    idNumber, workplace, occupation, maritalStatus,
    ethnicity, contactPhone, contactPhone2, deliveryAddress,
    assignedHealthManager, assignedFamilyDoctor,
  } = req.body;

  if (!phone) return res.status(400).json({ success: false, message: '手机号不能为空' });

  // 检查手机号是否已存在
  const existing = await User.findOne({ phone });
  if (existing) return res.status(400).json({ success: false, message: '该手机号已存在' });

  // 自动分配：如果创建者是健管专员或家庭医生，默认分配给自己
  const hm = assignedHealthManager ||
    (staff.role === 'healthManager' ? staff._id : null);
  const fd = assignedFamilyDoctor ||
    (staff.role === 'familyDoctor' ? staff._id : null);

  const user = await User.create({
    phone,
    name: name || '患者',
    gender: gender || '未知',
    age, height, weight,
    chronicDiseases: chronicDiseases || [],
    patientType: patientType || '',
    source: source || '',
    remark: remark || '',
    idNumber: idNumber || '',
    workplace: workplace || '',
    occupation: occupation || '',
    maritalStatus: maritalStatus || '',
    ethnicity: ethnicity || '',
    contactPhone: contactPhone || '',
    contactPhone2: contactPhone2 || '',
    deliveryAddress: deliveryAddress || '',
    assignedHealthManager: hm,
    assignedFamilyDoctor: fd,
    onboardingCompleted: true,
  });

  res.json({ success: true, data: user });
});

// ── GET /api/staff/patients/:id ───────────────────────────────────
router.get('/patients/:id', staffAuth, async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-__v')
    .populate('assignedHealthManager', 'name title role')
    .populate('assignedFamilyDoctor', 'name title role');
  if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

  // 获取最近3条随访记录
  const recentFollowUps = await FollowUp.find({ patientId: user._id })
    .sort({ date: -1 })
    .limit(3)
    .populate('staffId', 'name role');

  // 最近健康记录（血压、血糖、体重）
  const recentRecords = await HealthRecord.find({ userId: user._id })
    .sort({ recordedAt: -1 })
    .limit(10)
    .select('type value extra recordedAt');

  res.json({ success: true, data: { user, recentFollowUps, recentRecords } });
});

// ── PUT /api/staff/patients/:id ───────────────────────────────────
router.put('/patients/:id', staffAuth, async (req, res) => {
  const allowed = [
    'name', 'gender', 'age', 'height', 'weight',
    'chronicDiseases', 'patientType', 'source', 'remark',
    'idNumber', 'workplace', 'occupation', 'maritalStatus',
    'ethnicity', 'contactPhone', 'contactPhone2', 'deliveryAddress',
    'assignedHealthManager', 'assignedFamilyDoctor',
    'servicePackage', 'serviceExpiry', 'serviceStartDate',
    'bloodTypeABO', 'bloodTypeRH',
    'traumaHistory', 'transfusionHistory', 'infectiousHistory', 'vaccinationHistory',
  ];
  const updateData = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updateData[k] = req.body[k];
  });

  // 生活方式嵌套字段（逐个展开，避免覆盖其他字段）
  if (req.body.lifestyle && typeof req.body.lifestyle === 'object') {
    ['diet', 'exercise', 'sleep', 'water', 'alcohol', 'smoking', 'bowel', 'mood'].forEach(k => {
      if (req.body.lifestyle[k] !== undefined) updateData[`lifestyle.${k}`] = req.body.lifestyle[k];
    });
  }

  // 健康档案字符串字段（仅更新文本，不覆盖数组字段）
  if (req.body.healthProfile && typeof req.body.healthProfile === 'object') {
    ['bloodType', 'drugAllergy', 'foodAllergy', 'pastHistory', 'medicHistory', 'surgeryHistory', 'menstrualHistory', 'maritalHistory'].forEach(k => {
      if (req.body.healthProfile[k] !== undefined) updateData[`healthProfile.${k}`] = req.body.healthProfile[k];
    });
  }

  await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, { $set: updateData });
  const user = await User.findById(req.params.id)
    .populate('assignedHealthManager', 'name title')
    .populate('assignedFamilyDoctor', 'name title');
  res.json({ success: true, data: user });
});

// ── GET /api/staff/patients/:id/followups ─────────────────────────
router.get('/patients/:id/followups', staffAuth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [followUps, total] = await Promise.all([
    FollowUp.find({ patientId: req.params.id })
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('staffId', 'name role title'),
    FollowUp.countDocuments({ patientId: req.params.id }),
  ]);
  res.json({ success: true, data: { followUps, total } });
});

// ── GET /api/staff/followups ──────────────────────────────────────
// 我的随访列表（含计划中、已完成）
router.get('/followups', staffAuth, async (req, res) => {
  const { page = 1, limit = 20, status = '', date = '' } = req.query;
  const filter = { staffId: req.staff._id };
  if (status) filter.status = status;
  if (date) {
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    filter.date = { $gte: start, $lt: end };
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [followUps, total] = await Promise.all([
    FollowUp.find(filter)
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('patientId', 'name phone gender age chronicDiseases'),
    FollowUp.countDocuments(filter),
  ]);
  res.json({ success: true, data: { followUps, total } });
});

// ── POST /api/staff/followups ─────────────────────────────────────
router.post('/followups', staffAuth, async (req, res) => {
  const { patientId, date, type, status, content, nextFollowUpDate, tags, vitals } = req.body;
  if (!patientId) return res.status(400).json({ success: false, message: '患者ID不能为空' });

  const patient = await User.findById(patientId);
  if (!patient) return res.status(404).json({ success: false, message: '患者不存在' });

  const followUp = await FollowUp.create({
    staffId: req.staff._id,
    patientId,
    date: date ? new Date(date) : new Date(),
    type: type || 'phone',
    status: status || 'completed',
    content: content || '',
    nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
    tags: tags || [],
    vitals: vitals || {},
  });

  await followUp.populate('patientId', 'name phone');
  res.json({ success: true, data: followUp });
});

// ── PUT /api/staff/followups/:id ──────────────────────────────────
router.put('/followups/:id', staffAuth, async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, staffId: req.staff._id });
  if (!followUp) return res.status(404).json({ success: false, message: '随访记录不存在' });

  const allowed = ['date', 'type', 'status', 'content', 'nextFollowUpDate', 'tags', 'vitals'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) followUp[k] = req.body[k];
  });
  await followUp.save();
  res.json({ success: true, data: followUp });
});

// ── DELETE /api/staff/followups/:id ──────────────────────────────
router.delete('/followups/:id', staffAuth, async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, staffId: req.staff._id });
  if (!followUp) return res.status(404).json({ success: false, message: '随访记录不存在' });
  await followUp.deleteOne();
  res.json({ success: true, message: '已删除' });
});

// ── GET /api/staff/reports ────────────────────────────────────────
// 简报：我的患者数、今日随访数、本月随访数
router.get('/reports', staffAuth, async (req, res) => {
  const staff = req.staff;
  const myFilter = staff.role === 'superadmin' ? {} :
    staff.role === 'familyDoctor'
      ? { assignedFamilyDoctor: staff._id }
      : { assignedHealthManager: staff._id };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [totalPatients, todayFollowUps, monthFollowUps, plannedFollowUps] = await Promise.all([
    User.countDocuments(myFilter),
    FollowUp.countDocuments({ staffId: staff._id, date: { $gte: today, $lt: tomorrow } }),
    FollowUp.countDocuments({ staffId: staff._id, date: { $gte: monthStart, $lt: monthEnd } }),
    FollowUp.countDocuments({ staffId: staff._id, status: 'planned' }),
  ]);

  // 慢病分布
  const diseaseAgg = await User.aggregate([
    { $match: { ...myFilter, chronicDiseases: { $exists: true, $ne: [] } } },
    { $unwind: '$chronicDiseases' },
    { $group: { _id: '$chronicDiseases', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  res.json({
    success: true,
    data: {
      totalPatients,
      todayFollowUps,
      monthFollowUps,
      plannedFollowUps,
      diseaseDistribution: diseaseAgg.map(d => ({ disease: d._id, count: d.count })),
    },
  });
});

// ── GET /api/staff/staff-list ─────────────────────────────────────
// 获取同部门医护人员列表（用于患者分配下拉）
router.get('/staff-list', staffAuth, async (req, res) => {
  const { role = '' } = req.query;
  const filter = {};
  if (role) filter.role = role;
  const list = await Admin.find(filter).select('name role title department').sort({ name: 1 });
  const ROLE_LABEL_MAP = ROLE_LABEL;
  const result = list.map(s => ({
    _id: s._id,
    name: s.name,
    role: s.role,
    roleLabel: ROLE_LABEL_MAP[s.role] || s.role,
    title: s.title,
    department: s.department,
  }));
  res.json({ success: true, data: result });
});

// ════════════════════════════════════════════════════════
// P2 路由
// ════════════════════════════════════════════════════════

// ── 健康方案 ──────────────────────────────────────────────
// GET /api/staff/plans?patientId=&type=&status=
router.get('/plans', staffAuth, async (req, res) => {
  const { patientId, type, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (patientId) filter.patientId = patientId;
  if (type) filter.type = type;
  if (status) filter.status = status;
  // 非超管只能看自己创建的
  if (req.staff.role !== 'superadmin') filter.staffId = req.staff._id;
  const skip = (Number(page) - 1) * Number(limit);
  const [plans, total] = await Promise.all([
    HealthPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('patientId', 'name phone').populate('staffId', 'name role'),
    HealthPlan.countDocuments(filter),
  ]);
  res.json({ success: true, data: { plans, total } });
});

// GET /api/staff/plans/:id
router.get('/plans/:id', staffAuth, async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id)
    .populate('patientId', 'name phone gender age').populate('staffId', 'name role title');
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  res.json({ success: true, data: plan });
});

// POST /api/staff/plans
router.post('/plans', staffAuth, async (req, res) => {
  const { patientId, type, title, description, year, startDate, endDate, items, followupFrequency, summary } = req.body;
  if (!patientId || !type || !title) return res.status(400).json({ success: false, message: '患者、类型、标题不能为空' });
  const plan = await HealthPlan.create({
    staffId: req.staff._id, patientId, type, title,
    description: description || '', year: year || new Date().getFullYear(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    items: (items || []).map(item => ({ ...item, status: 'pending' })),
    followupFrequency: followupFrequency || '',
    summary: summary || '',
    status: 'draft',
  });
  res.json({ success: true, data: plan });
});

// PUT /api/staff/plans/:id
router.put('/plans/:id', staffAuth, async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  const allowed = ['title', 'description', 'year', 'startDate', 'endDate', 'items', 'followupFrequency', 'summary', 'status'];
  allowed.forEach(k => { if (req.body[k] !== undefined) plan[k] = req.body[k]; });
  await plan.save();
  res.json({ success: true, data: plan });
});

// PATCH /api/staff/plans/:id/push — 推送方案至客户端
router.patch('/plans/:id/push', staffAuth, async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  plan.status = 'active';
  plan.pushedAt = new Date();
  await plan.save();
  // 创建推送记录
  await PushRecord.create({
    staffId: req.staff._id, patientId: plan.patientId,
    type: 'plan', planId: plan._id,
    title: plan.title, content: plan.summary || plan.description,
  });
  res.json({ success: true, data: plan });
});

// PATCH /api/staff/plans/:id/items/:itemId — 更新方案项目状态
router.patch('/plans/:id/items/:itemId', staffAuth, async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  const item = plan.items.id(req.params.itemId);
  if (!item) return res.status(404).json({ success: false, message: '项目不存在' });
  const { status, reportId, completedAt } = req.body;
  if (status) item.status = status;
  if (reportId) item.reportId = reportId;
  item.completedAt = status === 'completed' ? (completedAt ? new Date(completedAt) : new Date()) : item.completedAt;
  await plan.save();
  res.json({ success: true, data: plan });
});

// DELETE /api/staff/plans/:id
router.delete('/plans/:id', staffAuth, async (req, res) => {
  await HealthPlan.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '已删除' });
});

// ── 报告管理 ──────────────────────────────────────────────
// GET /api/staff/medical-reports?patientId=&status=
router.get('/medical-reports', staffAuth, async (req, res) => {
  const { patientId, status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (patientId) filter.user = patientId;
  if (status === 'unaudited') filter.audit_status = 'unaudited';
  else if (status === 'audited') filter.audit_status = 'audited';
  else if (status === 'rejected') filter.audit_status = 'rejected';
  const skip = (Number(page) - 1) * Number(limit);
  const [reports, total] = await Promise.all([
    MedicalReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .select('-content') // 不返回文件内容（太大）
      .populate('user', 'name phone').populate('uploadedBy', 'name role'),
    MedicalReport.countDocuments(filter),
  ]);
  res.json({ success: true, data: { reports, total } });
});

// GET /api/staff/medical-reports/:id
router.get('/medical-reports/:id', staffAuth, async (req, res) => {
  const report = await MedicalReport.findById(req.params.id)
    .populate('user', 'name phone').populate('uploadedBy', 'name');
  if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
  res.json({ success: true, data: report });
});

// POST /api/staff/medical-reports — 上传报告（Base64）
router.post('/medical-reports', staffAuth, async (req, res) => {
  const { patientId, title, type, hospital, date, fileUrl, content, mimeType, fileSize, planId, planItemId } = req.body;
  if (!patientId || !title) return res.status(400).json({ success: false, message: '患者和标题不能为空' });
  const report = await MedicalReport.create({
    user: patientId, title, type: type || 'other', hospital: hospital || '',
    date: date || '', fileUrl: fileUrl || '', content: content || '',
    mimeType: mimeType || '', fileSize: fileSize || '',
    uploadedBy: req.staff._id, audit_status: 'unaudited',
    planId: planId || null, planItemId: planItemId || null,
  });
  // 如果关联了方案项目，自动标记为待审核
  if (planId && planItemId) {
    const plan = await HealthPlan.findById(planId);
    if (plan) {
      const item = plan.items.id(planItemId);
      if (item) { item.reportId = report._id; await plan.save(); }
    }
  }
  res.json({ success: true, data: report });
});

// PATCH /api/staff/medical-reports/:id/audit — 审核报告
router.patch('/medical-reports/:id/audit', staffAuth, async (req, res) => {
  const { action, rejectReason } = req.body; // action: 'approve' | 'reject'
  const report = await MedicalReport.findById(req.params.id);
  if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
  if (action === 'approve') {
    report.audit_status = 'audited';
    report.audited_by = req.staff.name;
    report.audited_at = new Date();
    // 如果关联方案项目，自动完成
    if (report.planId && report.planItemId) {
      const plan = await HealthPlan.findById(report.planId);
      if (plan) {
        const item = plan.items.id(report.planItemId);
        if (item) { item.status = 'completed'; item.completedAt = new Date(); await plan.save(); }
      }
    }
  } else {
    report.audit_status = 'rejected';
    report.reject_reason = rejectReason || '';
  }
  await report.save();
  res.json({ success: true, data: report });
});

// ── 科普知识库 ────────────────────────────────────────────
// GET /api/staff/knowledge?category=&tag=
router.get('/knowledge', staffAuth, async (req, res) => {
  const { category, tag, search, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (tag) filter.tags = tag;
  if (search) filter.title = { $regex: search, $options: 'i' };
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    KnowledgeItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('createdBy', 'name role'),
    KnowledgeItem.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, total } });
});

// POST /api/staff/knowledge — 创建知识条目
router.post('/knowledge', staffAuth, async (req, res) => {
  const { title, category, tags, content, fileUrl, fileType, coverUrl } = req.body;
  if (!title) return res.status(400).json({ success: false, message: '标题不能为空' });
  const item = await KnowledgeItem.create({
    createdBy: req.staff._id, title, category: category || 'other',
    tags: tags || [], content: content || '',
    fileUrl: fileUrl || '', fileType: fileType || '', coverUrl: coverUrl || '',
  });
  res.json({ success: true, data: item });
});

// DELETE /api/staff/knowledge/:id
router.delete('/knowledge/:id', staffAuth, async (req, res) => {
  await KnowledgeItem.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '已删除' });
});

// POST /api/staff/knowledge/:id/push — 推送给患者
router.post('/knowledge/:id/push', staffAuth, async (req, res) => {
  const { patientIds } = req.body; // 数组
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择患者' });
  const item = await KnowledgeItem.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '内容不存在' });
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'knowledge', knowledgeId: item._id,
    title: item.title, content: item.content?.slice(0, 100) || '',
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位患者` });
});

// ── 问卷推送 ───────────────────────────────────────────────
// GET /api/staff/questionnaires — 问卷模板列表（复用 admin 问卷）
router.get('/questionnaires', staffAuth, async (req, res) => {
  const qs = await DynamicQuestionnaire.find({ status: 'active' }).select('title description').sort({ createdAt: -1 });
  res.json({ success: true, data: qs });
});

// POST /api/staff/questionnaires/:id/push — 推送问卷给患者
router.post('/questionnaires/:id/push', staffAuth, async (req, res) => {
  const { patientIds, deadline } = req.body;
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择患者' });
  const q = await DynamicQuestionnaire.findById(req.params.id);
  if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'questionnaire', questionnaireId: q._id,
    title: q.title, content: deadline ? `截止：${new Date(deadline).toLocaleDateString('zh-CN')}` : '',
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `问卷已推送给 ${patientIds.length} 位患者` });
});

// GET /api/staff/push-records?patientId=&type=
router.get('/push-records', staffAuth, async (req, res) => {
  const { patientId, type, page = 1, limit = 20 } = req.query;
  const filter = { staffId: req.staff._id };
  if (patientId) filter.patientId = patientId;
  if (type) filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    PushRecord.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('patientId', 'name phone'),
    PushRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: { records, total } });
});

// ── 服务记录（就医/专科/心理/运动/中医） ──────────────────
// GET /api/staff/service-records?patientId=&type=
router.get('/service-records', staffAuth, async (req, res) => {
  const { patientId, type, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (req.staff.role !== 'superadmin') filter.staffId = req.staff._id;
  if (patientId) filter.patientId = patientId;
  if (type) filter.type = type;
  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    ServiceRecord.find(filter).sort({ date: -1 }).skip(skip).limit(Number(limit))
      .populate('patientId', 'name phone gender age').populate('staffId', 'name role'),
    ServiceRecord.countDocuments(filter),
  ]);
  res.json({ success: true, data: { records, total } });
});

// POST /api/staff/service-records
router.post('/service-records', staffAuth, async (req, res) => {
  const { patientId, type, date, title, content, result, nextDate, medicalEscort, tcmRecord, specialistRecord } = req.body;
  if (!patientId || !type) return res.status(400).json({ success: false, message: '患者和类型不能为空' });
  const record = await ServiceRecord.create({
    staffId: req.staff._id, patientId, type,
    date: date ? new Date(date) : new Date(),
    title: title || '', content: content || '', result: result || '',
    nextDate: nextDate ? new Date(nextDate) : null,
    medicalEscort: medicalEscort || {}, tcmRecord: tcmRecord || {}, specialistRecord: specialistRecord || {},
  });
  await record.populate('patientId', 'name phone');
  res.json({ success: true, data: record });
});

// PUT /api/staff/service-records/:id
router.put('/service-records/:id', staffAuth, async (req, res) => {
  const record = await ServiceRecord.findOne({ _id: req.params.id, staffId: req.staff._id });
  if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
  const allowed = ['date', 'title', 'content', 'result', 'nextDate', 'medicalEscort', 'tcmRecord', 'specialistRecord'];
  allowed.forEach(k => { if (req.body[k] !== undefined) record[k] = req.body[k]; });
  await record.save();
  res.json({ success: true, data: record });
});

// DELETE /api/staff/service-records/:id
router.delete('/service-records/:id', staffAuth, async (req, res) => {
  await ServiceRecord.findOneAndDelete({ _id: req.params.id, staffId: req.staff._id });
  res.json({ success: true, message: '已删除' });
});

// ── 分佣中心 ───────────────────────────────────────────────
// GET /api/staff/commission/me — 我的分佣记录
router.get('/commission/me', staffAuth, async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const filter = { staffId: req.staff._id };
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [records, total, totalEarned] = await Promise.all([
    Commission.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('patientId', 'name phone').populate('orderId', 'total'),
    Commission.countDocuments(filter),
    Commission.aggregate([
      { $match: { staffId: req.staff._id, status: { $in: ['confirmed', 'paid'] } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } },
    ]),
  ]);
  res.json({ success: true, data: { records, total, totalEarned: totalEarned[0]?.total || 0 } });
});

// GET /api/staff/commission/code — 获取/生成我的推荐码
router.get('/commission/code', staffAuth, async (req, res) => {
  // 用 staffId 生成固定推荐码
  const code = crypto.createHash('md5').update(req.staff._id.toString()).digest('hex').slice(0, 8).toUpperCase();
  res.json({ success: true, data: { referralCode: code, staffId: req.staff._id, name: req.staff.name } });
});

// GET /api/staff/commission/team — 管理员查看团队分佣
router.get('/commission/team', staffAuth, async (req, res) => {
  if (!['superadmin', 'manager'].includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '无权限' });
  }
  const stats = await Commission.aggregate([
    { $group: {
      _id: '$staffId',
      totalAmount: { $sum: '$commissionAmount' },
      totalOrders: { $sum: 1 },
      pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$commissionAmount', 0] } },
      paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$commissionAmount', 0] } },
    }},
    { $sort: { totalAmount: -1 } },
  ]);
  await Admin.populate(stats, { path: '_id', select: 'name role title' });
  res.json({ success: true, data: stats });
});

// ── 运营数据看板 ───────────────────────────────────────────
// GET /api/staff/operations/dashboard
router.get('/operations/dashboard', staffAuth, async (req, res) => {
  const OPS_ROLES = ['superadmin', 'manager'];
  if (!OPS_ROLES.includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '无运营权限' });
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
  const [
    totalPatients, todayNew, monthNew,
    diseaseAgg, orderStats,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: today } }),
    User.countDocuments({ createdAt: { $gte: monthStart } }),
    User.aggregate([
      { $match: { chronicDiseases: { $exists: true, $ne: [] } } },
      { $unwind: '$chronicDiseases' },
      { $group: { _id: '$chronicDiseases', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 },
    ]),
    Order.aggregate([
      { $match: { status: { $in: ['paid', 'completed'] } } },
      { $group: {
        _id: null,
        total: { $sum: '$total' },
        thisMonth: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, '$total', 0] } },
        count: { $sum: 1 },
      }},
    ]),
  ]);

  res.json({
    success: true,
    data: {
      patients: { total: totalPatients, todayNew, monthNew },
      diseaseDistribution: diseaseAgg.map(d => ({ disease: d._id, count: d.count })),
      revenue: {
        total: orderStats[0]?.total || 0,
        thisMonth: orderStats[0]?.thisMonth || 0,
        orderCount: orderStats[0]?.count || 0,
      },
    },
  });
});

// ════════════════════════════════════════════════════════
// P3 路由
// ════════════════════════════════════════════════════════

// ── 个人中心 ───────────────────────────────────────────────
// PUT /api/staff/me — 更新个人信息
router.put('/me', staffAuth, async (req, res) => {
  const allowed = ['name', 'title', 'department', 'avatar', 'phone', 'region'];
  const update = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  await Admin.findByIdAndUpdate(req.staff._id, update);
  const s = await Admin.findById(req.staff._id).select('-password');
  res.json({ success: true, data: s });
});

// PUT /api/staff/me/password — 修改密码
router.put('/me/password', staffAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) return res.status(400).json({ success: false, message: '请填写原密码和新密码' });
  const admin = await Admin.findById(req.staff._id);
  const ok = await admin.comparePassword(oldPassword);
  if (!ok) return res.status(400).json({ success: false, message: '原密码错误' });
  admin.password = newPassword;
  await admin.save();
  res.json({ success: true, message: '密码已修改' });
});

// ── 产品推送 ───────────────────────────────────────────────
// GET /api/staff/products — 服务商城产品列表
const SERVICE_CATALOG_P3 = [
  { id: 'S1', category: '检测套餐', name: '心脑血管精准检测套餐', subtitle: '含颈动脉超声 + 心脏彩超 + 血脂全套', price: 980, originalPrice: 1380, icon: '❤️' },
  { id: 'S2', category: '专家咨询', name: '心内科专家30分钟视频问诊', subtitle: '主任医师一对一，报告解读+用药建议', price: 299, originalPrice: 499, icon: '🩺' },
  { id: 'S3', category: '上门服务', name: '上门采血 + 基础体检', subtitle: '护士上门抽血，含血常规、血脂、血糖', price: 199, originalPrice: 280, icon: '🏠' },
  { id: 'S4', category: '健康课程', name: '高血压患者自我管理训练营', subtitle: '4周系统课程，含饮食+运动+用药+监测', price: 399, originalPrice: 598, icon: '📚' },
  { id: 'S5', category: '检测套餐', name: '糖化血红蛋白 + 胰岛素三项', subtitle: '全面评估血糖控制水平', price: 258, originalPrice: 360, icon: '🩸' },
  { id: 'S6', category: '专家咨询', name: '营养师一对一方案定制', subtitle: '根据病情定制个性化饮食计划', price: 168, originalPrice: 238, icon: '🥗' },
  { id: 'pkg_1y', category: '服务包', name: '年度服务包', subtitle: '12个月专属健康管理服务', price: 3650, originalPrice: 5000, icon: '🌟' },
  { id: 'pkg_6m', category: '服务包', name: '半年服务包', subtitle: '6个月专属健康管理服务', price: 1980, originalPrice: 2800, icon: '⭐' },
  { id: 'pkg_3m', category: '服务包', name: '季度服务包', subtitle: '3个月专属健康管理服务', price: 1080, originalPrice: 1480, icon: '✨' },
];

router.get('/products', staffAuth, async (req, res) => {
  const { category = '' } = req.query;
  let list = SERVICE_CATALOG_P3;
  if (category) list = list.filter(p => p.category === category);
  res.json({ success: true, data: { products: list } });
});

// POST /api/staff/products/:id/push — 推送产品给患者
router.post('/products/:id/push', staffAuth, async (req, res) => {
  const { patientIds } = req.body;
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择患者' });
  const product = SERVICE_CATALOG_P3.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'product',
    title: product.name, content: product.subtitle || '',
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位患者` });
});

// ── 团队管理 ───────────────────────────────────────────────
// GET /api/staff/team — 获取团队成员列表（可见下级）
router.get('/team', staffAuth, async (req, res) => {
  const MANAGER_ROLES = ['superadmin', 'familyDoctor', 'nutritionist', 'medicalAssistant', 'healthManager'];
  if (!MANAGER_ROLES.includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '无权限查看团队' });
  }
  const STAFF_ROLES = ['familyDoctor', 'nutritionist', 'healthManager', 'medicalAssistant', 'psychologist', 'rehabSpecialist', 'tcmDoctor', 'specialist', 'healthPlanner'];
  const filter = req.staff.role === 'superadmin' ? { role: { $in: STAFF_ROLES } } : { role: { $in: STAFF_ROLES }, department: req.staff.department };
  const members = await Admin.find(filter).select('name role title department avatar createdAt').sort({ role: 1, name: 1 });
  // 为每个成员统计数据
  const statsArr = await Promise.all(members.map(async m => {
    const myFilter = m.role === 'familyDoctor'
      ? { assignedFamilyDoctor: m._id }
      : { assignedHealthManager: m._id };
    const [patientCount, followupCount, planCount] = await Promise.all([
      User.countDocuments(myFilter),
      FollowUp.countDocuments({ staffId: m._id }),
      HealthPlan.countDocuments({ staffId: m._id }),
    ]);
    return { _id: m._id, name: m.name, role: m.role, roleLabel: ROLE_LABEL[m.role] || m.role, title: m.title, department: m.department, patientCount, followupCount, planCount };
  }));
  res.json({ success: true, data: { members: statsArr, total: statsArr.length } });
});

// ── 患者档案 - 附属数据 ─────────────────────────────────────
// GET /api/staff/patients/:id/plans — 患者的健康方案列表
router.get('/patients/:id/plans', staffAuth, async (req, res) => {
  const plans = await HealthPlan.find({ patientId: req.params.id })
    .sort({ createdAt: -1 })
    .populate('staffId', 'name role');
  res.json({ success: true, data: plans });
});

// GET /api/staff/patients/:id/reports — 患者的体检报告列表
router.get('/patients/:id/reports', staffAuth, async (req, res) => {
  const reports = await MedicalReport.find({ user: req.params.id })
    .select('-content')
    .sort({ createdAt: -1 })
    .populate('uploadedBy', 'name role');
  res.json({ success: true, data: reports });
});

// GET /api/staff/patients/:id/service-records — 患者的服务记录
router.get('/patients/:id/service-records', staffAuth, async (req, res) => {
  const records = await ServiceRecord.find({ patientId: req.params.id })
    .sort({ date: -1 })
    .populate('staffId', 'name role');
  res.json({ success: true, data: records });
});

// ════════════════════════════════════════════════════════
// P4 路由
// ════════════════════════════════════════════════════════

// ── 赠送服务/健康基金 ───────────────────────────────────────
// POST /api/staff/patients/:id/gift
router.post('/patients/:id/gift', staffAuth, async (req, res) => {
  const { giftType, serviceName, serviceCount, fundAmount, fundType, validFrom, validTo, remark } = req.body;
  if (!giftType) return res.status(400).json({ success: false, message: '赠送类型不能为空' });
  const gift = await GiftRecord.create({
    staffId: req.staff._id, patientId: req.params.id,
    giftType, serviceName: serviceName || '', serviceCount: serviceCount || 0,
    fundAmount: fundAmount || 0, fundType: fundType || 'enterprise',
    validFrom: validFrom ? new Date(validFrom) : null,
    validTo: validTo ? new Date(validTo) : null,
    remark: remark || '',
  });
  // 如果赠送健康基金，更新患者 healthFund 余额
  if (giftType === 'fund' && fundAmount > 0) {
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $inc: { healthFundBalance: fundAmount } }
    );
  }
  res.json({ success: true, data: gift });
});

// GET /api/staff/patients/:id/gifts
router.get('/patients/:id/gifts', staffAuth, async (req, res) => {
  const gifts = await GiftRecord.find({ patientId: req.params.id })
    .sort({ createdAt: -1 })
    .populate('staffId', 'name role');
  res.json({ success: true, data: gifts });
});

// ── 跨角色转介 ──────────────────────────────────────────────
// POST /api/staff/referrals — 发起转介
router.post('/referrals', staffAuth, async (req, res) => {
  const { patientId, toStaffId, reason, content, urgency } = req.body;
  if (!patientId || !toStaffId || !reason) {
    return res.status(400).json({ success: false, message: '患者、接收人、原因不能为空' });
  }
  const referral = await Referral.create({
    fromStaffId: req.staff._id, toStaffId, patientId,
    reason, content: content || '', urgency: urgency || 'normal',
  });
  await referral.populate([
    { path: 'fromStaffId', select: 'name role' },
    { path: 'toStaffId', select: 'name role' },
    { path: 'patientId', select: 'name phone' },
  ]);
  res.json({ success: true, data: referral });
});

// GET /api/staff/referrals?direction=sent|received&status=
router.get('/referrals', staffAuth, async (req, res) => {
  const { direction = 'received', status = '', page = 1, limit = 20 } = req.query;
  const filter = direction === 'sent'
    ? { fromStaffId: req.staff._id }
    : { toStaffId: req.staff._id };
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [referrals, total] = await Promise.all([
    Referral.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .populate('fromStaffId', 'name role title')
      .populate('toStaffId', 'name role title')
      .populate('patientId', 'name phone chronicDiseases'),
    Referral.countDocuments(filter),
  ]);
  res.json({ success: true, data: { referrals, total } });
});

// PATCH /api/staff/referrals/:id — 更新转介状态（接收/完成/拒绝）
router.patch('/referrals/:id', staffAuth, async (req, res) => {
  const { status, response } = req.body;
  const referral = await Referral.findOne({ _id: req.params.id, toStaffId: req.staff._id });
  if (!referral) return res.status(404).json({ success: false, message: '转介记录不存在或无权操作' });
  if (status) referral.status = status;
  if (response !== undefined) referral.response = response;
  referral.respondedAt = new Date();
  await referral.save();
  res.json({ success: true, data: referral });
});

// ── 服务到期提醒 ────────────────────────────────────────────
// GET /api/staff/patients/expiring?days=30
router.get('/patients/expiring', staffAuth, async (req, res) => {
  const days = Number(req.query.days) || 30;
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const staff = req.staff;
  const myFilter = staff.role === 'superadmin' ? {} :
    staff.role === 'familyDoctor'
      ? { assignedFamilyDoctor: staff._id }
      : { assignedHealthManager: staff._id };

  const patients = await User.find({
    ...myFilter,
    serviceExpiry: { $gt: now, $lte: cutoff },
  }).select('name phone servicePackage serviceExpiry assignedHealthManager assignedFamilyDoctor')
    .populate('assignedHealthManager', 'name')
    .populate('assignedFamilyDoctor', 'name')
    .sort({ serviceExpiry: 1 })
    .limit(50);

  res.json({ success: true, data: patients });
});

// ── 通知中心（聚合） ───────────────────────────────────────
// GET /api/staff/notifications
router.get('/notifications', staffAuth, async (req, res) => {
  const staff = req.staff;
  const now = new Date();
  const cutoff30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const myFilter = staff.role === 'superadmin' ? {} :
    staff.role === 'familyDoctor'
      ? { assignedFamilyDoctor: staff._id }
      : { assignedHealthManager: staff._id };

  const [recentPushes, pendingReferrals, expiringPatients, unreadReferralCount] = await Promise.all([
    // 最近30条推送记录（含阅读状态）
    PushRecord.find({ staffId: staff._id })
      .sort({ createdAt: -1 }).limit(30)
      .populate('patientId', 'name'),
    // 待处理转介（发给我的、pending状态）
    Referral.find({ toStaffId: staff._id, status: 'pending' })
      .sort({ createdAt: -1 }).limit(20)
      .populate('fromStaffId', 'name role')
      .populate('patientId', 'name phone'),
    // 即将到期患者（30天内）
    User.find({ ...myFilter, serviceExpiry: { $gt: now, $lte: cutoff30 } })
      .select('name phone servicePackage serviceExpiry')
      .sort({ serviceExpiry: 1 }).limit(20),
    // 未读转介数量
    Referral.countDocuments({ toStaffId: staff._id, status: 'pending' }),
  ]);

  res.json({
    success: true,
    data: {
      recentPushes,
      pendingReferrals,
      expiringPatients,
      unreadReferralCount,
      summary: {
        pushCount: recentPushes.length,
        pendingReferralCount: unreadReferralCount,
        expiringCount: expiringPatients.length,
      },
    },
  });
});

// ── 获取患者的活跃方案（用于报告关联） ─────────────────────
// GET /api/staff/patients/:id/active-plan-items
router.get('/patients/:id/active-plan-items', staffAuth, async (req, res) => {
  const plans = await HealthPlan.find({ patientId: req.params.id, status: 'active' })
    .select('title type items');
  const items = [];
  plans.forEach(plan => {
    (plan.items || []).forEach(item => {
      if (item.status === 'pending') {
        items.push({
          planId: plan._id,
          planTitle: plan.title,
          planType: plan.type,
          itemId: item._id,
          itemName: item.name,
          scheduledDate: item.scheduledDate,
        });
      }
    });
  });
  res.json({ success: true, data: items });
});

module.exports = router;
