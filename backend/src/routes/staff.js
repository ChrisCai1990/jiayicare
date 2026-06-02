const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
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
const { DynamicQuestionnaire, QuestionnaireResponse } = require('../models/DynamicQuestionnaire');
const Message        = require('../models/Message');
const MemberLevel    = require('../models/MemberLevel');
const Activity       = require('../models/Activity');
const SessionPackage = require('../models/SessionPackage');
const AnnualPlan = require('../models/AnnualPlan');
const Product = require('../models/Product');
const FollowUpForm      = require('../models/FollowUpForm');
const FollowUpPlan      = require('../models/FollowUpPlan');
const SystemConfig      = require('../models/SystemConfig');
const ExamRequisition   = require('../models/ExamRequisition');
const LabTestOrder      = require('../models/LabTestOrder');
const SpecialExam       = require('../models/SpecialExam');
const AbnormalReview    = require('../models/AbnormalReview');
const PlanTemplate      = require('../models/PlanTemplate');
const staffAuth = require('../middleware/staffAuth');
const router = express.Router();

// ── 图片上传（multer） ─────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('只支持图片文件'));
  },
});

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

// 获取某员工所有下属 ID（递归一层，支持组长看下属）
async function getSubordinateIds(staffId) {
  const subs = await Admin.find({ managerId: staffId }).select('_id');
  return subs.map(s => s._id);
}

// ── GET /api/staff/patients ───────────────────────────────────────
// 查询分配给当前医护人员（及其下属）的患者列表
router.get('/patients', staffAuth, async (req, res) => {
  const { page = 1, limit = 20, search = '', disease = '', type = '' } = req.query;
  const staff = req.staff;

  // 超管看全部，其他角色只看分配给自己（及下属）的患者
  let staffIds = [staff._id];
  if (staff.role !== 'superadmin') {
    const subIds = await getSubordinateIds(staff._id);
    staffIds = [staff._id, ...subIds];
  }

  const assignFilter = {};
  if (staff.role !== 'superadmin') {
    if (staff.role === 'familyDoctor') {
      assignFilter.assignedFamilyDoctor = { $in: staffIds };
    } else if (staff.role === 'nutritionist') {
      assignFilter.assignedNutritionist = { $in: staffIds };
    } else {
      // healthManager 及所有其他角色（含组长下属）
      assignFilter.assignedHealthManager = { $in: staffIds };
    }
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
      .select('name phone gender age height weight healthScore servicePackage serviceExpiry chronicDiseases patientType assignedHealthManager assignedFamilyDoctor assignedNutritionist source createdAt contactPhone')
      .populate('assignedHealthManager', 'name title')
      .populate('assignedFamilyDoctor', 'name title')
      .populate('assignedNutritionist', 'name title'),
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
    birthDate, idNumber, maritalStatus, ethnicity, belief, memberType,
    chronicDiseases, patientType, source, remark,
    workplace, occupation,
    address, contactPhone, contactPhone2, contactName, contactPhone3, deliveryAddress,
    bloodTypeABO, bloodTypeRH,
    drugAllergy, foodAllergy,
    traumaHistory, transfusionHistory, infectiousHistory, vaccinationHistory,
    smoking, drinking, exercise,
    lifestyle, healthProfile,
    menstrualHistory, maritalHistory,
    assignedHealthManager, assignedFamilyDoctor, assignedNutritionist,
    patientCategory, childProfile,
    servicePackage, serviceStartDate, serviceExpiry,
  } = req.body;

  if (!phone) return res.status(400).json({ success: false, message: '手机号不能为空' });

  const existing = await User.findOne({ phone });
  if (existing) return res.status(400).json({ success: false, message: '该手机号已存在' });

  // 自动分配：如果创建者是对应角色，默认分配给自己
  const hm = assignedHealthManager ||
    (staff.role === 'healthManager' ? staff._id : null);
  const fd = assignedFamilyDoctor ||
    (staff.role === 'familyDoctor' ? staff._id : null);
  const nn = assignedNutritionist ||
    (staff.role === 'nutritionist' ? staff._id : null);

  const createData = {
    phone,
    name: name || '会员',
    gender: gender || '未知',
    age, height, weight,
    birthDate: birthDate || '',
    idNumber: idNumber || '',
    maritalStatus: maritalStatus || '',
    ethnicity: ethnicity || '',
    belief: belief || '',
    memberType: memberType || '',
    chronicDiseases: chronicDiseases || [],
    patientType: patientType || '',
    source: source || '',
    remark: remark || '',
    workplace: workplace || '',
    occupation: occupation || '',
    address: address || '',
    contactPhone: contactPhone || '',
    contactPhone2: contactPhone2 || '',
    contactName: contactName || '',
    contactPhone3: contactPhone3 || '',
    deliveryAddress: deliveryAddress || '',
    bloodTypeABO: bloodTypeABO || '',
    bloodTypeRH: bloodTypeRH || '',
    traumaHistory: traumaHistory || '',
    transfusionHistory: transfusionHistory || '',
    infectiousHistory: infectiousHistory || '',
    vaccinationHistory: vaccinationHistory || '',
    patientCategory: patientCategory || 'adult',
    assignedHealthManager: hm,
    assignedFamilyDoctor: fd,
    assignedNutritionist: nn,
    servicePackage: servicePackage || '',
    serviceStartDate: serviceStartDate || '',
    serviceExpiry: serviceExpiry || '',
    onboardingCompleted: true,
  };

  // 生活方式（嵌套）
  if (lifestyle && typeof lifestyle === 'object') {
    createData.lifestyle = lifestyle;
  } else {
    // 兼容旧版顶层字段
    if (smoking !== undefined) createData['lifestyle.smoking'] = smoking;
    if (drinking !== undefined) createData['lifestyle.alcohol'] = drinking;
    if (exercise !== undefined) createData['lifestyle.exercise'] = exercise;
  }

  // 健康档案（嵌套）
  const hp = {};
  if (drugAllergy !== undefined)  hp.drugAllergy  = drugAllergy;
  if (foodAllergy !== undefined)  hp.foodAllergy  = foodAllergy;
  if (menstrualHistory !== undefined) hp.menstrualHistory = menstrualHistory;
  if (maritalHistory !== undefined)   hp.maritalHistory   = maritalHistory;
  if (healthProfile && typeof healthProfile === 'object') {
    Object.assign(hp, healthProfile);
  }
  if (Object.keys(hp).length > 0) createData.healthProfile = hp;

  // 儿童档案
  if (patientCategory === 'child' && childProfile) {
    createData.childProfile = childProfile;
  }

  const user = await User.create(createData);
  res.json({ success: true, data: user });
});

// ── GET /api/staff/patients/:id ───────────────────────────────────
router.get('/patients/:id', staffAuth, async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('-__v')
    .populate('assignedHealthManager', 'name title role')
    .populate('assignedFamilyDoctor', 'name title role')
    .populate('assignedNutritionist', 'name title role');
  if (!user) return res.status(404).json({ success: false, message: '会员不存在' });

  // 权限校验：非超管只能查看分配给自己（或下属）的患者
  if (req.staff.role !== 'superadmin') {
    const staffIds = [req.staff._id, ...(await getSubordinateIds(req.staff._id))];
    const matches = (field) => field && staffIds.some(id => id.equals(field._id || field));
    const isHM = matches(user.assignedHealthManager);
    const isFD = matches(user.assignedFamilyDoctor);
    const isNN = matches(user.assignedNutritionist);
    if (!isHM && !isFD && !isNN) {
      return res.status(403).json({ success: false, message: '无权限查看该会员' });
    }
  }

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
    'birthDate', 'memberType', 'belief',
    'chronicDiseases', 'patientType', 'source', 'remark',
    'idNumber', 'workplace', 'occupation', 'maritalStatus',
    'ethnicity', 'address', 'contactPhone', 'contactPhone2', 'contactName', 'contactPhone3', 'deliveryAddress',
    'assignedHealthManager', 'assignedFamilyDoctor', 'assignedNutritionist',
    'servicePackage', 'serviceExpiry', 'serviceStartDate',
    'bloodTypeABO', 'bloodTypeRH',
    'traumaHistory', 'transfusionHistory', 'infectiousHistory', 'vaccinationHistory',
  ];
  const updateData = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updateData[k] = req.body[k];
  });

  // 归属字段为空字符串时不覆盖（空字符串 = 未指定，不等于"取消分配"）
  // 取消分配应通过专用的转派功能完成
  ['assignedHealthManager', 'assignedFamilyDoctor', 'assignedNutritionist'].forEach(k => {
    if (updateData[k] === '') delete updateData[k];
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
    .populate('assignedFamilyDoctor', 'name title')
    .populate('assignedNutritionist', 'name title');
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
// 我的随访列表（含计划中、已完成；数据权限：创建人或被分配人）
router.get('/followups', staffAuth, async (req, res) => {
  const { page = 1, limit = 20, status = '', dateFrom = '', dateTo = '', patientName = '' } = req.query;

  // 如果按患者姓名搜索，先查出匹配的用户ID
  let patientFilter = {};
  if (patientName) {
    const matchedUsers = await User.find({ name: { $regex: patientName, $options: 'i' } }).select('_id');
    patientFilter = { patientId: { $in: matchedUsers.map(u => u._id) } };
  }

  // 数据权限：当前医护创建的 OR 分配给当前医护的
  const ownerFilter = { $or: [{ staffId: req.staff._id }, { assignedTo: req.staff._id }] };

  const filter = { ...ownerFilter, ...patientFilter };
  if (status) {
    // in_progress 同时包含旧的 missed 状态
    if (status === 'in_progress') filter.status = { $in: ['in_progress', 'missed'] };
    else filter.status = status;
  }
  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo) { const end = new Date(dateTo); end.setDate(end.getDate() + 1); filter.date.$lt = end; }
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [followUps, total] = await Promise.all([
    FollowUp.find(filter)
      .sort({ date: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('patientId', 'name phone gender age chronicDiseases')
      .populate('assignedTo', 'name role'),
    FollowUp.countDocuments(filter),
  ]);
  res.json({ success: true, data: { followUps, total } });
});

// ── POST /api/staff/followups ─────────────────────────────────────
router.post('/followups', staffAuth, async (req, res) => {
  const { patientId, date, type, status, content, theme, assignedTo, cancelReason, nextFollowUpDate, tags, vitals, checkInItems, followUpSchemeId, formData } = req.body;
  if (!patientId) return res.status(400).json({ success: false, message: '会员ID不能为空' });

  const patient = await User.findById(patientId);
  if (!patient) return res.status(404).json({ success: false, message: '会员不存在' });

  if (status === 'cancelled' && !cancelReason) {
    return res.status(400).json({ success: false, message: '取消随访必须填写取消原因' });
  }

  const followUp = await FollowUp.create({
    staffId: req.staff._id,
    patientId,
    date: date ? new Date(date) : new Date(),
    type: type || 'phone',
    status: status || 'completed',
    content: content || '',
    theme: theme || '',
    cancelReason: cancelReason || '',
    assignedTo: assignedTo || null,
    nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
    tags: tags || [],
    vitals: vitals || {},
    checkInItems: checkInItems || [],
    followUpSchemeId: followUpSchemeId || null,
    formData: formData || null,
  });

  await followUp.populate('patientId', 'name phone');
  res.json({ success: true, data: followUp });
});

// ── PUT /api/staff/followups/:id ──────────────────────────────────
router.put('/followups/:id', staffAuth, async (req, res) => {
  // 允许创建人或被分配人更新
  const followUp = await FollowUp.findOne({
    _id: req.params.id,
    $or: [{ staffId: req.staff._id }, { assignedTo: req.staff._id }],
  });
  if (!followUp) return res.status(404).json({ success: false, message: '随访记录不存在' });

  if (req.body.status === 'cancelled' && !req.body.cancelReason && !followUp.cancelReason) {
    return res.status(400).json({ success: false, message: '取消随访必须填写取消原因' });
  }

  const allowed = ['date', 'type', 'status', 'content', 'theme', 'cancelReason', 'assignedTo', 'nextFollowUpDate', 'tags', 'vitals', 'checkInItems'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) followUp[k] = req.body[k];
  });
  await followUp.save();
  res.json({ success: true, data: followUp });
});

// ── DELETE /api/staff/followups/:id ──────────────────────────────
// 软删除：状态改为 cancelled，不物理删除
router.delete('/followups/:id', staffAuth, async (req, res) => {
  const followUp = await FollowUp.findOne({ _id: req.params.id, staffId: req.staff._id });
  if (!followUp) return res.status(404).json({ success: false, message: '随访记录不存在' });
  followUp.status = 'cancelled';
  if (!followUp.cancelReason) followUp.cancelReason = '手动删除';
  await followUp.save();
  res.json({ success: true, message: '已取消' });
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
  const { patientId, type, title, description, year, startDate, endDate, items, followupFrequency, summary, content } = req.body;
  if (!patientId || !type || !title) return res.status(400).json({ success: false, message: '会员、类型、标题不能为空' });
  const plan = await HealthPlan.create({
    staffId: req.staff._id, patientId, type, title,
    description: description || '', year: year || new Date().getFullYear(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    items: (items || []).map(item => ({ ...item, status: 'pending' })),
    followupFrequency: followupFrequency || '',
    summary: summary || '',
    content: content || {},
    status: 'draft',
  });
  res.json({ success: true, data: plan });
});

// PUT /api/staff/plans/:id
router.put('/plans/:id', staffAuth, async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  const allowed = ['title', 'description', 'year', 'startDate', 'endDate', 'items', 'followupFrequency', 'summary', 'status', 'content'];
  allowed.forEach(k => { if (req.body[k] !== undefined) plan[k] = req.body[k]; });
  plan.markModified('content');
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
  if (!patientId || !title) return res.status(400).json({ success: false, message: '会员和标题不能为空' });
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
  const { action, rejectReason, abnormalItems } = req.body; // action: 'approve' | 'reject'
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
    // 如果有异常项目，自动创建复查任务
    if (abnormalItems && abnormalItems.length > 0) {
      await AbnormalReview.create({
        patientId: report.user,
        reportId:  report._id,
        staffId:   req.staff._id,
        title:     `${report.title || '报告'}异常复查`,
        abnormalItems,
      });
    }
  } else {
    report.audit_status = 'rejected';
    report.reject_reason = rejectReason || '';
  }
  await report.save();
  res.json({ success: true, data: report });
});

// ── 图片上传 ─────────────────────────────────────────────
// POST /api/staff/upload/image
router.post('/upload/image', staffAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '未收到文件' });
  const host = process.env.API_HOST || 'http://121.40.156.39';
  const url = `${host}/api/uploads/${req.file.filename}`;
  res.json({ success: true, data: { url } });
});

// ── 随访表单库 ────────────────────────────────────────────
// GET /api/staff/followup-forms — 获取启用的随访表单列表（供创建随访时选用）
router.get('/followup-forms', staffAuth, async (req, res) => {
  try {
    const forms = await FollowUpForm.find({ status: 'active' }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: forms });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/staff/plan-templates?type= — 健康方案模板列表（新建方案时选用）
router.get('/plan-templates', staffAuth, async (req, res) => {
  try {
    const { type } = req.query;
    const filter = { status: 'active' };
    if (type) filter.type = type;
    const templates = await PlanTemplate.find(filter).sort({ name: 1 }).lean();
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/staff/followup-plans — 获取启用的随访方案列表（含表单结构和预设内容）
router.get('/followup-plans', staffAuth, async (req, res) => {
  try {
    const plans = await FollowUpPlan.find({ status: 'active' })
      .populate('formId', 'name fields')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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

// POST /api/staff/knowledge/:id/push — 推送给会员
router.post('/knowledge/:id/push', staffAuth, async (req, res) => {
  const { patientIds } = req.body; // 数组
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const item = await KnowledgeItem.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '内容不存在' });
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'knowledge', knowledgeId: item._id,
    title: item.title, content: item.content?.slice(0, 100) || '',
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位会员` });
});

// ── 问卷推送 ───────────────────────────────────────────────
// GET /api/staff/questionnaires — 问卷模板列表（含草稿，供医护查看；仅 active 可推送）
router.get('/questionnaires', staffAuth, async (req, res) => {
  const qs = await DynamicQuestionnaire.find().select('title description status questions deadline createdAt').sort({ createdAt: -1 });
  res.json({ success: true, data: qs });
});

// POST /api/staff/questionnaires/:id/push — 推送问卷给会员
router.post('/questionnaires/:id/push', staffAuth, async (req, res) => {
  const { patientIds, deadline } = req.body;
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const q = await DynamicQuestionnaire.findById(req.params.id);
  if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });

  // 写推送记录
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'questionnaire', questionnaireId: q._id,
    title: q.title, content: deadline ? `截止：${new Date(deadline).toLocaleDateString('zh-CN')}` : '',
  }));
  await PushRecord.insertMany(records);

  // 同步将会员加入问卷 targetUsers，确保 /questionnaire/pending 能查询到
  const newIds = patientIds.filter(pid => !q.targetUsers?.some(uid => uid.toString() === pid.toString()));
  if (newIds.length > 0) {
    await DynamicQuestionnaire.findByIdAndUpdate(q._id, {
      $addToSet: { targetUsers: { $each: newIds } },
      $set: { targetType: 'specific', ...(deadline ? { deadline } : {}) },
    });
  }

  res.json({ success: true, message: `问卷已推送给 ${patientIds.length} 位会员` });
});

// GET /api/staff/questionnaires/:id/responses — 查看问卷回答列表（医护端）
router.get('/questionnaires/:id/responses', staffAuth, async (req, res) => {
  try {
    const q = await DynamicQuestionnaire.findById(req.params.id).select('title questions');
    if (!q) return res.status(404).json({ success: false, message: '问卷不存在' });
    const responses = await QuestionnaireResponse.find({ questionnaire: req.params.id })
      .populate('user', 'name phone')
      .sort({ submittedAt: -1 });
    res.json({ success: true, data: { questionnaire: q, responses } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
  if (!patientId || !type) return res.status(400).json({ success: false, message: '会员和类型不能为空' });
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
// GET /api/staff/products — 从商城产品集合获取（与管理后台联通）
router.get('/products', staffAuth, async (req, res) => {
  const { category = '' } = req.query;
  const filter = { status: 'on' };
  if (category) filter.category = category;
  const products = await Product.find(filter).sort({ sortOrder: 1 });
  const list = products.map(p => ({
    id: p._id.toString(),
    category: p.category,
    name: p.name,
    subtitle: p.subtitle || '',
    price: p.originalPrice,
    originalPrice: p.originalPrice,
    icon: '🛍',
    servicePrices: p.servicePrices || [],
    features: p.features || [],
  }));
  res.json({ success: true, data: { products: list } });
});

// POST /api/staff/products/push-bundle — 推送多产品组合给会员
router.post('/products/push-bundle', staffAuth, async (req, res) => {
  const { productIds, patientIds } = req.body;
  if (!productIds?.length) return res.status(400).json({ success: false, message: '请选择产品' });
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const products = await Product.find({ _id: { $in: productIds } });
  if (!products.length) return res.status(404).json({ success: false, message: '产品不存在' });
  const productItems = products.map(p => ({
    productId: p._id.toString(), name: p.name,
    price: p.originalPrice, category: p.category, icon: '🛍',
  }));
  const totalPrice = productItems.reduce((sum, p) => sum + p.price, 0);
  const title = products.length === 1 ? products[0].name : `产品推荐（${products.length}项）`;
  const content = productItems.map(p => `${p.name} ¥${p.price}`).join('、');
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'product', title, content,
    price: totalPrice,
    productId: products.length === 1 ? products[0]._id.toString() : null,
    products: productItems,
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位会员` });
});

// POST /api/staff/products/:id/push — 推送产品给会员（兼容旧版）
router.post('/products/:id/push', staffAuth, async (req, res) => {
  const { patientIds } = req.body;
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const product = await Product.findById(req.params.id).catch(() => null);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'product',
    title: product.name,
    content: product.subtitle || '',
    price: product.originalPrice || null,
    productId: product._id.toString(),
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位会员` });
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

// ── 检查开单（ExamRequisition） ───────────────────────────
// GET /api/staff/patients/:id/requisitions
router.get('/patients/:id/requisitions', staffAuth, async (req, res) => {
  try {
    const reqs = await ExamRequisition.find({ patientId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('staffId', 'name role');
    res.json({ success: true, data: reqs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/staff/requisitions — 创建开单
router.post('/requisitions', staffAuth, async (req, res) => {
  try {
    const { patientId, title, notes, items, dueDate } = req.body;
    if (!patientId || !items?.length) {
      return res.status(400).json({ success: false, message: '请选择会员并添加开单项目' });
    }
    const req_ = await ExamRequisition.create({
      patientId, staffId: req.staff._id,
      title: title || '检查开单',
      notes: notes || '',
      items: items.map(i => ({
        itemType: i.itemType,
        itemId:   i.itemId,
        itemName: i.itemName,
        notes:    i.notes || '',
        status:   'pending',
      })),
      dueDate: dueDate || null,
    });
    res.json({ success: true, data: req_ });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/requisitions/:id/cancel — 取消开单
router.patch('/requisitions/:id/cancel', staffAuth, async (req, res) => {
  try {
    const r = await ExamRequisition.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: '开单不存在' });
    r.status = 'cancelled';
    await r.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/staff/requisition-items — 获取可开单的项目列表（检验医嘱 + 检查医嘱）
router.get('/requisition-items', staffAuth, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const [labOrders, specialExams] = await Promise.all([
      LabTestOrder.find({ ...filter, status: 'active' }).select('name mnemonic items').limit(100),
      SpecialExam.find({ ...filter, status: 'active' }).select('name mnemonic examType').limit(100),
    ]);
    const result = [
      ...labOrders.map(o => ({ _id: o._id, name: o.name, mnemonic: o.mnemonic, type: 'labTestOrder', typeName: '检验医嘱' })),
      ...specialExams.map(e => ({ _id: e._id, name: e.name, mnemonic: e.mnemonic, type: 'specialExam', typeName: '检查医嘱' })),
    ];
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── User app: 获取待上传开单 ──────────────────────────────
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

// ── 发送消息给会员 ──────────────────────────────────────────
// POST /api/staff/patients/:id/message — 给会员发站内消息（显示在用户 MessagesScreen）
router.post('/patients/:id/message', staffAuth, async (req, res) => {
  try {
    const { content, type = 'notice' } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: '消息内容不能为空' });
    const patient = await User.findById(req.params.id);
    if (!patient) return res.status(404).json({ success: false, message: '会员不存在' });

    const msg = await Message.create({
      user:    req.params.id,
      type:    'system',
      sender:  req.staff.name || '健康管理团队',
      content: content.trim(),
      unread:  true,
    });
    res.json({ success: true, data: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 跨角色转介 ──────────────────────────────────────────────
// POST /api/staff/referrals — 发起转介
router.post('/referrals', staffAuth, async (req, res) => {
  const { patientId, toStaffId, reason, content, urgency } = req.body;
  if (!patientId || !toStaffId || !reason) {
    return res.status(400).json({ success: false, message: '会员、接收人、原因不能为空' });
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

// ════════════════════════════════════════════════════════
// 会员营销模块
// ════════════════════════════════════════════════════════

// ── 会员等级 ────────────────────────────────────────────
router.get('/marketing/levels', staffAuth, async (req, res) => {
  const levels = await MemberLevel.find().sort({ sortOrder: 1, minPoints: 1 });
  res.json({ success: true, data: levels });
});
router.post('/marketing/levels', staffAuth, async (req, res) => {
  const { name, minPoints, color, benefits, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '等级名称不能为空' });
  const level = await MemberLevel.create({ name, minPoints: minPoints || 0, color: color || '#8AA89C', benefits: benefits || [], sortOrder: sortOrder || 0 });
  res.json({ success: true, data: level });
});
router.put('/marketing/levels/:id', staffAuth, async (req, res) => {
  const level = await MemberLevel.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!level) return res.status(404).json({ success: false, message: '等级不存在' });
  res.json({ success: true, data: level });
});
router.delete('/marketing/levels/:id', staffAuth, async (req, res) => {
  await MemberLevel.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 活动管理 ────────────────────────────────────────────
router.get('/marketing/activities', staffAuth, async (req, res) => {
  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  const activities = await Activity.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'name');
  res.json({ success: true, data: activities });
});
router.post('/marketing/activities', staffAuth, async (req, res) => {
  if (!req.body.title) return res.status(400).json({ success: false, message: '活动名称不能为空' });
  const activity = await Activity.create({ ...req.body, createdBy: req.staff._id });
  res.json({ success: true, data: activity });
});
router.put('/marketing/activities/:id', staffAuth, async (req, res) => {
  const activity = await Activity.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!activity) return res.status(404).json({ success: false, message: '活动不存在' });
  res.json({ success: true, data: activity });
});
router.delete('/marketing/activities/:id', staffAuth, async (req, res) => {
  await Activity.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 次卡套餐 ────────────────────────────────────────────
router.get('/marketing/packages', staffAuth, async (req, res) => {
  const packages = await SessionPackage.find().sort({ createdAt: -1 }).populate('createdBy', 'name');
  res.json({ success: true, data: packages });
});
router.post('/marketing/packages', staffAuth, async (req, res) => {
  const { name, count, price } = req.body;
  if (!name || !count || !price) return res.status(400).json({ success: false, message: '名称、次数、价格不能为空' });
  const pkg = await SessionPackage.create({ ...req.body, createdBy: req.staff._id });
  res.json({ success: true, data: pkg });
});
router.put('/marketing/packages/:id', staffAuth, async (req, res) => {
  const pkg = await SessionPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!pkg) return res.status(404).json({ success: false, message: '套餐不存在' });
  res.json({ success: true, data: pkg });
});
router.delete('/marketing/packages/:id', staffAuth, async (req, res) => {
  await SessionPackage.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 异常复查模块 ─────────────────────────────────────────────────────
// GET /api/staff/abnormal-reviews
router.get('/abnormal-reviews', staffAuth, async (req, res) => {
  try {
    const { patientId, status, limit = 50 } = req.query;
    const filter = {};
    if (patientId) filter.patientId = patientId;
    if (status) filter.status = status;

    // 权限过滤：非 superadmin/manager 只看自己管的患者
    if (!['superadmin', 'manager'].includes(req.staff.role)) {
      const myPatients = await User.find({ assignedFamilyDoctor: req.staff._id }).select('_id');
      const myPatientsSet = new Set(myPatients.map(p => p._id.toString()));
      const managed = await User.find({ assignedHealthManager: req.staff._id }).select('_id');
      managed.forEach(p => myPatientsSet.add(p._id.toString()));
      if (!patientId) filter.patientId = { $in: [...myPatientsSet] };
    }

    const reviews = await AbnormalReview.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('patientId', 'name phone')
      .populate('staffId', 'name')
      .populate('reportId', 'title reportDate');
    res.json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/staff/abnormal-reviews
router.post('/abnormal-reviews', staffAuth, async (req, res) => {
  try {
    const { patientId, reportId, title, abnormalItems, reviewDate, notes } = req.body;
    if (!patientId) return res.status(400).json({ success: false, message: '请选择患者' });
    const review = await AbnormalReview.create({
      patientId, reportId: reportId || null, staffId: req.staff._id,
      title: title || '异常复查', abnormalItems: abnormalItems || [],
      reviewDate: reviewDate ? new Date(reviewDate) : null, notes: notes || '',
    });
    res.json({ success: true, data: review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/abnormal-reviews/:id
router.patch('/abnormal-reviews/:id', staffAuth, async (req, res) => {
  try {
    const { status, reviewDate, notes, resolvedNote } = req.body;
    const update = {};
    if (status) update.status = status;
    if (reviewDate) update.reviewDate = new Date(reviewDate);
    if (notes !== undefined) update.notes = notes;
    if (resolvedNote !== undefined) update.resolvedNote = resolvedNote;
    if (status === 'completed') update.resolvedAt = new Date();
    const review = await AbnormalReview.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('patientId', 'name phone')
      .populate('staffId', 'name');
    if (!review) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: review });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/staff/abnormal-reviews/:id
router.delete('/abnormal-reviews/:id', staffAuth, async (req, res) => {
  await AbnormalReview.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 会员运营：积分 / 充值余额管理 ──────────────────────────────────────
// GET /api/staff/patients/:id/membership
router.get('/patients/:id/membership', staffAuth, async (req, res) => {
  try {
    const u = await User.findById(req.params.id).select('name phone cardNumber points rechargeBalance healthFundBalance memberType servicePackage serviceExpiry');
    if (!u) return res.status(404).json({ success: false, message: '用户不存在' });
    res.json({ success: true, data: u });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/membership
router.patch('/patients/:id/membership', staffAuth, async (req, res) => {
  try {
    const { cardNumber, pointsDelta, rechargeDelta, note } = req.body;
    const update = {};
    if (cardNumber !== undefined) update.cardNumber = cardNumber;
    const inc = {};
    if (pointsDelta) inc.points = pointsDelta;
    if (rechargeDelta) inc.rechargeBalance = rechargeDelta;
    const ops = { $set: update };
    if (Object.keys(inc).length) ops.$inc = inc;
    await User.updateOne({ _id: req.params.id }, ops);
    const u = await User.findById(req.params.id).select('name cardNumber points rechargeBalance healthFundBalance');
    res.json({ success: true, data: u });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 年度健康管理方案（全局列表）────────────────────────────────────────
router.get('/annual-health-plans', staffAuth, async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const plans = await AnnualPlan.find({ year })
      .populate('patientId', 'name phone')
      .populate('createdBy', 'name')
      .sort({ updatedAt: -1 });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 年度管理方案 ─────────────────────────────────────────────────────
router.get('/patients/:id/annual-plan', staffAuth, async (req, res) => {
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

router.put('/patients/:id/annual-plan', staffAuth, async (req, res) => {
  try {
    const { planType, moduleData, notes, year } = req.body;
    const targetYear = year || new Date().getFullYear();
    const plan = await AnnualPlan.findOneAndUpdate(
      { patientId: req.params.id, year: targetYear },
      { planType, moduleData: moduleData || {}, notes: notes || '', createdBy: req.staff._id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/staff/patients/:id/annual-plan/push ────────────────
router.patch('/patients/:id/annual-plan/push', staffAuth, async (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const plan = await AnnualPlan.findOneAndUpdate(
      { patientId: req.params.id, year: targetYear },
      { pushedAt: new Date(), pushedBy: req.staff._id },
      { new: true }
    );
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在，请先保存' });
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
