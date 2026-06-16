const express = require('express');
const jwt = require('jsonwebtoken');
let _ssePublish = null;
function ssePublish(...args) { if (!_ssePublish) { try { _ssePublish = require('./messages').ssePublish; } catch {} } _ssePublish?.(...args); }
const mongoose = require('mongoose');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { calculateHealthScore } = require('../utils/healthScore');
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
const LabTestPackage    = require('../models/LabTestPackage');
const LabTestItem       = require('../models/LabTestItem');
const ProjectCategory   = require('../models/ProjectCategory');
const FunctionalMedicineTest = require('../models/FunctionalMedicineTest');
const SpecialExam       = require('../models/SpecialExam');
const AbnormalReview    = require('../models/AbnormalReview');
const Task              = require('../models/Task');
const PlanTemplate      = require('../models/PlanTemplate');
const Medication        = require('../models/Medication');
const Supplement        = require('../models/Supplement');
const UserScreeningItem = require('../models/UserScreeningItem');
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

// 专项筛查文件上传（图片 + PDF，最大 20MB）
const uploadScreening = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, 'screening');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('只支持图片（JPG/PNG）或 PDF 文件'));
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

  const admin = await Admin.findOne({ $or: [{ username }, { phone: username }] });
  if (!admin || !(await admin.comparePassword(password))) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  if (!STAFF_ROLES.includes(admin.role)) {
    return res.status(403).json({ success: false, message: '该账号无医护端权限' });
  }

  const token = jwt.sign(
    { id: admin._id, type: 'admin', role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
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

// ── GET /api/staff/patients/search-registered — 搜索已注册但未分配给我的用户
router.get('/patients/search-registered', staffAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ success: true, data: [] });
  const filter = {
    $or: [
      { name: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
    ],
  };
  const users = await User.find(filter)
    .select('name phone gender age healthScore assignedHealthManager assignedFamilyDoctor assignedNutritionist')
    .limit(20);
  res.json({ success: true, data: users });
});

// ── POST /api/staff/patients/assign — 将已注册用户分配给当前医护
router.post('/patients/assign', staffAuth, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: '缺少 userId' });
  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

  const role = req.staff.role;
  const fieldMap = {
    healthManager:    'assignedHealthManager',
    nutritionist:     'assignedNutritionist',
    familyDoctor:     'assignedFamilyDoctor',
    superadmin:       'assignedHealthManager',
    // 兼容旧格式（如有历史数据）
    health_manager:   'assignedHealthManager',
    family_doctor:    'assignedFamilyDoctor',
  };
  const field = fieldMap[role] || 'assignedHealthManager';
  await User.collection.updateOne(
    { _id: user._id },
    { $set: { [field]: req.staff._id } }
  );
  res.json({ success: true, message: '分配成功' });
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
    traumaHistory, transfusionHistory, poisoningHistory, infectiousHistory, vaccinationHistory, otherDiseaseHistory,
    smoking, drinking, exercise,
    lifestyle, healthProfile,
    education, hasAnnualCheckup,
    healthConcern, healthConcernFor, expectedService, hasHomeMonitor, hasMedicineCabinet,
    menstrualHistory, maritalHistory,
    assignedHealthManager, assignedFamilyDoctor, assignedNutritionist,
    patientCategory, childProfile,
    servicePackage, serviceStartDate, serviceExpiry,
    basic_insurance, commercial_medical, critical_illness,
    initialBloodPressure, initialHeartRate, initialWeight, initialSleepHours, initialMoodScore,
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
    poisoningHistory: poisoningHistory || '',
    infectiousHistory: infectiousHistory || '',
    vaccinationHistory: vaccinationHistory || '',
    otherDiseaseHistory: otherDiseaseHistory || '',
    education: education || '',
    hasAnnualCheckup: hasAnnualCheckup || '',
    healthConcern: healthConcern || '',
    healthConcernFor: healthConcernFor || '',
    expectedService: expectedService || '',
    hasHomeMonitor: hasHomeMonitor || '',
    hasMedicineCabinet: hasMedicineCabinet || '',
    patientCategory: patientCategory || 'adult',
    assignedHealthManager: hm,
    assignedFamilyDoctor: fd,
    assignedNutritionist: nn,
    servicePackage: servicePackage || '',
    serviceStartDate: serviceStartDate || '',
    serviceExpiry: serviceExpiry || '',
    onboardingCompleted: true,
    basic_insurance: basic_insurance || '',
    commercial_medical: commercial_medical || '',
    critical_illness: critical_illness || '',
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

  // 创建初始健康记录（建档时预填，用户首次登录即可见）
  const today = new Date().toISOString().split('T')[0];
  const initRecords = [];
  if (initialBloodPressure && /^\d+\/\d+$/.test(initialBloodPressure.trim())) {
    const [sys, dia] = initialBloodPressure.trim().split('/').map(Number);
    if (!isNaN(sys) && !isNaN(dia)) {
      initRecords.push({ userId: user._id, type: 'bloodPressure', category: 'vitals', label: '血压', unit: 'mmHg', value: initialBloodPressure.trim(), extra: { sys, dia }, status: 'normal', recordedAt: new Date() });
    }
  }
  if (initialHeartRate && !isNaN(Number(initialHeartRate))) {
    initRecords.push({ userId: user._id, type: 'heartRate', category: 'vitals', label: '心率', unit: '次/分', value: String(initialHeartRate), status: 'normal', recordedAt: new Date() });
  }
  if (initialWeight && !isNaN(Number(initialWeight))) {
    initRecords.push({ userId: user._id, type: 'weight', category: 'vitals', label: '体重', unit: 'kg', value: String(initialWeight), status: 'normal', recordedAt: new Date() });
  }
  if (initialSleepHours && !isNaN(Number(initialSleepHours))) {
    initRecords.push({ userId: user._id, type: 'sleep', category: 'lifestyle', label: '睡眠', unit: '小时', value: String(initialSleepHours), status: 'normal', recordedAt: new Date() });
  }
  if (initialMoodScore && !isNaN(Number(initialMoodScore))) {
    initRecords.push({ userId: user._id, type: 'mood', category: 'lifestyle', label: '情绪', unit: '分', value: String(initialMoodScore), status: 'normal', recordedAt: new Date() });
  }
  if (initRecords.length > 0) {
    await HealthRecord.insertMany(initRecords);
  }

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
  const recentRecords = await HealthRecord.find({ user: user._id })
    .sort({ recordedAt: -1 })
    .limit(30)
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
    'servicePackage', 'serviceExpiry', 'serviceStartDate', 'isRegisteredClient',
    'bloodTypeABO', 'bloodTypeRH',
    'traumaHistory', 'transfusionHistory', 'poisoningHistory', 'infectiousHistory', 'vaccinationHistory', 'otherDiseaseHistory',
    'basic_insurance', 'commercial_medical', 'critical_illness',
    'chronicDiseaseSeverity', 'labValues', 'healthScoreBonus',
    'education', 'hasAnnualCheckup',
    'healthConcern', 'healthConcernFor', 'expectedService', 'hasHomeMonitor', 'hasMedicineCabinet',
    'bodyComposition',
  ];
  const updateData = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updateData[k] = req.body[k];
  });

  // 归属字段：空字符串跳过（不清空原值），有值则必须转为 ObjectId
  // 原因：User.collection.updateOne 绕过 Mongoose 类型转换，字符串无法匹配 ObjectId 查询
  ['assignedHealthManager', 'assignedFamilyDoctor', 'assignedNutritionist'].forEach(k => {
    if (updateData[k] === '' || updateData[k] === null || updateData[k] === undefined) {
      delete updateData[k];
    } else {
      try {
        updateData[k] = new mongoose.Types.ObjectId(updateData[k]);
      } catch (e) {
        delete updateData[k]; // 无效ID，跳过
      }
    }
  });

  // 生活方式嵌套字段（逐个展开，避免覆盖其他字段）
  if (req.body.lifestyle && typeof req.body.lifestyle === 'object') {
    ['diet', 'exercise', 'sleep', 'water', 'alcohol', 'smoking', 'bowel', 'mood'].forEach(k => {
      if (req.body.lifestyle[k] !== undefined) updateData[`lifestyle.${k}`] = req.body.lifestyle[k];
    });
  }

  // 生活方式详细结构化数据（膳食调查表融合）
  if (req.body.lifestyle_data !== undefined) {
    updateData['lifestyle_data'] = req.body.lifestyle_data;
  }

  // 健康档案字段（字符串 + 数组）
  if (req.body.healthProfile && typeof req.body.healthProfile === 'object') {
    const strFields = ['bloodType', 'drugAllergy', 'foodAllergy', 'pastHistory', 'medicHistory', 'surgeryHistory',
      'menstrualHistory', 'maritalHistory', 'familyHistoryNote', 'sexualHistory', 'supplementHistory',
      'recentMedication', 'recentSupplement'];
    strFields.forEach(k => {
      if (req.body.healthProfile[k] !== undefined) updateData[`healthProfile.${k}`] = req.body.healthProfile[k];
    });
    if (Array.isArray(req.body.healthProfile.recentSymptoms)) {
      updateData['healthProfile.recentSymptoms'] = req.body.healthProfile.recentSymptoms;
    }
  }

  // 新增体检指标记录时推入历史
  const pushOps = {};
  if (req.body.labValues !== undefined && req.body._addLabHistory) {
    const entry = { ...req.body.labValues, recordedAt: new Date() };
    pushOps['labHistory'] = entry;
  }
  if (req.body.bodyComposition !== undefined && req.body._addBodyCompHistory) {
    const entry = { ...req.body.bodyComposition, recordedAt: new Date() };
    pushOps['bodyCompHistory'] = entry;
  }

  const ops = { $set: updateData };
  if (Object.keys(pushOps).length > 0) ops.$push = pushOps;

  await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, ops);
  const user = await User.findById(req.params.id)
    .populate('assignedHealthManager', 'name title')
    .populate('assignedFamilyDoctor', 'name title')
    .populate('assignedNutritionist', 'name title');
  res.json({ success: true, data: user });
});

// ── POST /api/staff/patients/:id/recalculate-score ────────────────
router.post('/patients/:id/recalculate-score', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

    const detail = calculateHealthScore(user);

    // 写回评分 + 明细 + 历史
    const today = new Date().toISOString().slice(0, 10);
    const history = (user.scoreHistory || []).filter(h => h.date !== today);
    history.push({ score: detail.total, date: today });
    if (history.length > 30) history.splice(0, history.length - 30);

    await User.collection.updateOne(
      { _id: user._id },
      { $set: {
          healthScore: detail.total,
          healthScoreDetail: detail,
          scoreHistory: history,
        }
      }
    );

    res.json({ success: true, data: detail });
  } catch (err) {
    console.error('recalculate-score error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
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

  // 获取本页患者最近一次打卡（健康记录）时间
  const patientIds = [...new Set(followUps.map(f => f.patientId?._id).filter(Boolean))];
  const lastRecords = await HealthRecord.aggregate([
    { $match: { userId: { $in: patientIds } } },
    { $sort: { recordedAt: -1 } },
    { $group: { _id: '$userId', lastAt: { $first: '$recordedAt' } } },
  ]);
  const lastRecordMap = {};
  lastRecords.forEach(r => { lastRecordMap[String(r._id)] = r.lastAt; });
  const followUpsWithRecord = followUps.map(f => ({
    ...f.toObject(),
    patientLastRecord: f.patientId ? (lastRecordMap[String(f.patientId._id)] || null) : null,
  }));

  res.json({ success: true, data: { followUps: followUpsWithRecord, total } });
});

// ── POST /api/staff/followups ─────────────────────────────────────
router.post('/followups', staffAuth, async (req, res) => {
  const { patientId, date, type, status, content, theme, assignedTo, cancelReason, nextFollowUpDate, tags, vitals, checkInItems, followUpSchemeId, formData, participants, interviewMinutes } = req.body;
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
    participants: participants || '',
    interviewMinutes: interviewMinutes || '',
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

  const allowed = ['date', 'type', 'status', 'content', 'theme', 'cancelReason', 'assignedTo', 'nextFollowUpDate', 'tags', 'vitals', 'checkInItems', 'participants', 'interviewMinutes'];
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
  try {
    const { patientId, title, type, hospital, date, fileUrl, content, mimeType, fileSize, planId, planItemId } = req.body;
    if (!patientId || !title) return res.status(400).json({ success: false, message: '会员和标题不能为空' });

    // base64 内容限制（约 7MB 原始文件 → 9.3MB base64）
    if (content && content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: '文件过大，请压缩后重试（最大约7MB）' });
    }
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp'];
    if (mimeType && !ALLOWED_MIME.includes(mimeType)) {
      return res.status(400).json({ success: false, message: `不支持的文件格式（${mimeType}）` });
    }

    const report = await MedicalReport.create({
      user: patientId, title, type: type || 'other', hospital: hospital || '',
      date: date || '', fileUrl: fileUrl || '', content: content || '',
      mimeType: mimeType || '', fileSize: fileSize || '',
      uploadedBy: req.staff._id, audit_status: 'unaudited',
      planId: planId || null, planItemId: planItemId || null,
    });
    if (planId && planItemId) {
      const plan = await HealthPlan.findById(planId);
      if (plan) {
        const item = plan.items.id(planItemId);
        if (item) { item.reportId = report._id; await plan.save(); }
      }
    }
    res.json({ success: true, data: report });
  } catch (err) {
    console.error('上传报告失败:', err);
    res.status(500).json({ success: false, message: '上传失败：' + (err.message || '服务器内部错误') });
  }
});

// PATCH /api/staff/medical-reports/:id — 修改报告信息（审核通过前可用）
router.patch('/medical-reports/:id', staffAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    if (report.audit_status === 'audited') return res.status(403).json({ success: false, message: '已审核通过的报告不可修改' });
    const { title, type, hospital, date, note, aiStatus, screeningCategory, reportYear, reportItems, aiSummary } = req.body;
    if (title !== undefined) report.title = title;
    if (type !== undefined) report.type = type;
    if (hospital !== undefined) report.hospital = hospital;
    if (date !== undefined) report.date = date;
    if (note !== undefined) report.note = note;
    // AI 审核字段
    if (aiStatus !== undefined) { report.aiStatus = aiStatus; report.reviewedAt = new Date(); report.reviewedByStaff = req.user._id; }
    if (screeningCategory !== undefined) report.screeningCategory = screeningCategory;
    if (reportYear !== undefined) report.reportYear = reportYear;
    if (reportItems !== undefined) report.reportItems = reportItems;
    if (aiSummary !== undefined) report.aiSummary = aiSummary;
    await report.save();
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/medical-reports/:id/audit — 审核报告
router.patch('/medical-reports/:id/audit', staffAuth, async (req, res) => {
  const { action, rejectReason, abnormalItems, reviewReason, reviewHospital, reviewDepartment, reviewDate, notes } = req.body;
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
    // 如果有异常项目，自动创建复查任务 + 用户待办任务
    if (abnormalItems && abnormalItems.length > 0) {
      const staffName = req.staff.name || req.staff.username || '健管师';
      const reviewTitle = `${report.title || '报告'}异常复查`;
      const task = await Task.create({
        user:        report.user,
        title:       reviewTitle,
        description: reviewReason || notes || '',
        category:    'followup_abnormal',
        type:        'followup_abnormal',
        priority:    'high',
        status:      'pending',
        dueDate:     reviewDate ? new Date(reviewDate).toISOString().slice(0, 10) : null,
        assignee:    staffName,
      });
      const review = await AbnormalReview.create({
        patientId:        report.user,
        reportId:         report._id,
        staffId:          req.staff._id,
        taskId:           task._id,
        title:            reviewTitle,
        reviewReason:     reviewReason     || '',
        reviewHospital:   reviewHospital   || '',
        reviewDepartment: reviewDepartment || '',
        abnormalItems,
        reviewDate:       reviewDate ? new Date(reviewDate) : null,
        notes:            notes || '',
      });
      await Task.findByIdAndUpdate(task._id, { abnormalReviewId: review._id });
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
// GET /api/staff/patients/:id/plans — 患者的健康方案列表（含年度管理方案）
router.get('/patients/:id/plans', staffAuth, async (req, res) => {
  const [healthPlans, annualPlans] = await Promise.all([
    HealthPlan.find({ patientId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('staffId', 'name role'),
    AnnualPlan.find({ patientId: req.params.id })
      .sort({ year: -1 })
      .populate('pushedBy', 'name role'),
  ]);

  const PLAN_TYPE_LABEL = {
    health_reshape: '健康重塑方案', young_state: '健康年轻态方案',
    chronic_stable: '慢病维稳方案', health_prevention: '健康预防方案',
  };
  const MODULE_NAME = {
    medical_treatment: '医疗问题解决', specialist_collab: '全专联合会诊',
    abnormal_followup: '异常复查提醒', vaccine: '疫苗接种',
    monitoring: '日常监测', lifestyle: '生活方式评估',
    medication: '药物服用', nutrition_supplement: '营养素补充',
    annual_checkup: '年度体检', functional_medicine: '功能医学检测',
    quarterly_eval: '季度评估',
  };

  const annualMapped = annualPlans.map(ap => ({
    _id: ap._id,
    title: `${ap.year}年 年度管理方案${ap.planType ? ` · ${PLAN_TYPE_LABEL[ap.planType] || ''}` : ''}`,
    type: 'annual_mgmt',
    status: ap.pushedAt ? 'active' : 'draft',
    year: ap.year,
    planType: ap.planType,
    moduleData: ap.moduleData,
    staffId: ap.pushedBy,
    pushedAt: ap.pushedAt,
    confirmedAt: ap.confirmedAt || null,
    isAnnualPlan: true,
    createdAt: ap.createdAt,
    items: Object.entries(ap.moduleData || {})
      .filter(([, v]) => v && v.enabled)
      .map(([key]) => ({ name: MODULE_NAME[key] || key, status: 'pending' })),
  }));

  res.json({ success: true, data: [...annualMapped, ...healthPlans] });
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

// GET /api/staff/requisition-items — 获取可开单的项目列表（检验医嘱 + 检查医嘱 + 套餐）
router.get('/requisition-items', staffAuth, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const [labOrders, specialExams, packages] = await Promise.all([
      LabTestOrder.find({ ...filter, status: 'active' }).select('name mnemonic items').limit(50),
      SpecialExam.find({ ...filter, status: 'active' }).select('name mnemonic examType').limit(50),
      LabTestPackage.find({ ...filter, status: 'active' }).select('name mnemonic labTestItems').limit(50),
    ]);
    const result = [
      ...packages.map(p => ({ _id: p._id, name: p.name, mnemonic: p.mnemonic, type: 'labTestPackage', typeName: '套餐', itemCount: p.labTestItems?.length || 0 })),
      ...labOrders.map(o => ({ _id: o._id, name: o.name, mnemonic: o.mnemonic, type: 'labTestOrder', typeName: '检验医嘱' })),
      ...specialExams.map(e => ({ _id: e._id, name: e.name, mnemonic: e.mnemonic, type: 'specialExam', typeName: '检查医嘱', description: e.description || '', conclusion: e.conclusion || '' })),
    ];
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/staff/requisition-items/:type/:id/sub-items — 获取套餐/医嘱的子项目（用于预填检验项目）
router.get('/requisition-items/:type/:id/sub-items', staffAuth, async (req, res) => {
  try {
    const { type, id } = req.params;
    let items = [];
    if (type === 'labTestPackage') {
      const pkg = await LabTestPackage.findById(id).populate('labTestItems', 'name unit referenceValue referenceRange');
      items = (pkg?.labTestItems || []).map(i => ({
        name: i.name,
        value: '',
        unit: i.unit || '',
        referenceRange: i.referenceRange || i.referenceValue || '',
        status: 'normal',
      }));
    } else if (type === 'labTestOrder') {
      const order = await LabTestOrder.findById(id).populate('items', 'name unit referenceValue referenceRange');
      items = (order?.items || []).map(i => ({
        name: i.name,
        value: '',
        unit: i.unit || '',
        referenceRange: i.referenceRange || i.referenceValue || '',
        status: 'normal',
      }));
    }
    res.json({ success: true, data: items });
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

    const typeMap = {
      doctor: 'doctor', chiefPhysician: 'doctor', physician: 'doctor',
      nutritionist: 'nutritionist',
      manager: 'manager', healthManager: 'manager', medicalAssistant: 'manager',
    };
    const staff = req.staff;
    const msgType = typeMap[staff.role] || 'manager';
    const roleKey = msgType === 'doctor' ? 'doctor' : msgType === 'nutritionist' ? 'nutritionist' : 'manager';
    const conversationId = `${req.params.id}_${roleKey}`;
    const senderLabel = staff.title ? `${staff.name}（${staff.title}）` : (staff.name || '健康管理团队');

    const msg = await Message.create({
      user:           req.params.id,
      type:           msgType,
      sender:         senderLabel,
      content:        content.trim(),
      unread:         true,
      conversationId,
      recipient:      roleKey,
    });
    ssePublish(conversationId, { type: 'message', data: msg });
    res.json({ success: true, data: msg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 跨角色转介 ──────────────────────────────────────────────
// POST /api/staff/referrals — 发起转介
router.post('/referrals', staffAuth, async (req, res) => {
  const { patientId, toStaffId, reason, content, urgency, attachedHealthInfo } = req.body;
  if (!patientId || !toStaffId || !reason) {
    return res.status(400).json({ success: false, message: '会员、接收人、原因不能为空' });
  }
  const referral = await Referral.create({
    fromStaffId: req.staff._id, toStaffId, patientId,
    reason, content: content || '', urgency: urgency || 'normal',
    attachedHealthInfo: attachedHealthInfo || null,
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
  if (response !== undefined && response.trim()) referral.response = response.trim();
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
    const {
      patientId, reportId, title, abnormalItems, reviewDate, notes,
      reviewReason, reviewHospital, reviewDepartment,
    } = req.body;
    if (!patientId) return res.status(400).json({ success: false, message: '请选择患者' });

    const staffName = req.staff.name || req.staff.username || '健管师';
    const reviewTitle = title || '异常复查提醒';

    // 给患者创建待办任务
    const task = await Task.create({
      user:        patientId,
      title:       reviewTitle,
      description: reviewReason || notes || '',
      category:    'followup_abnormal',
      type:        'followup_abnormal',
      priority:    'high',
      status:      'pending',
      dueDate:     reviewDate ? new Date(reviewDate).toISOString().slice(0, 10) : null,
      assignee:    staffName,
    });

    const review = await AbnormalReview.create({
      patientId, reportId: reportId || null, staffId: req.staff._id,
      taskId: task._id,
      title: reviewTitle,
      reviewReason:     reviewReason     || '',
      reviewHospital:   reviewHospital   || '',
      reviewDepartment: reviewDepartment || '',
      abnormalItems: abnormalItems || [],
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      notes: notes || '',
    });

    // 将 abnormalReviewId 写回 Task
    await Task.findByIdAndUpdate(task._id, { abnormalReviewId: review._id });

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
    // 同步写 PushRecord，让用户在消息中心收到通知
    const existing = await PushRecord.findOne({ patientId: req.params.id, type: 'plan', questionnaireId: null,
      title: `${targetYear}年度管理方案` });
    if (!existing) {
      await PushRecord.create({
        staffId: req.staff._id, patientId: req.params.id,
        type: 'plan',
        title: `${targetYear}年度管理方案`,
        content: '您的年度健康管理方案已发布，请前往"健康方案"查看。',
      });
    }
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/staff/patients/:id/orders ───────────────────────────
// 获取指定患者的服务订单（供医护端查看并安排）
router.get('/patients/:id/orders', staffAuth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.params.id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/staff/orders/:id/start ────────────────────────────
// 医护端启动服务（pending → scheduled）或标记完成（scheduled → completed）
router.patch('/orders/:id/start', staffAuth, async (req, res) => {
  try {
    const { action = 'schedule', scheduledAt, note } = req.body;
    const STATUS_MAP = { schedule: 'scheduled', complete: 'completed' };
    const newStatus = STATUS_MAP[action] || 'scheduled';
    const update = { status: newStatus, handledBy: req.staff._id };
    if (scheduledAt) update.scheduledAt = new Date(scheduledAt);
    if (newStatus === 'completed') update.completedAt = new Date();
    if (note) update.note = note;
    const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('user', 'name phone');
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    res.json({ success: true, data: order, message: newStatus === 'completed' ? '服务已完成' : '服务已安排' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 患者药物管理（医护端 CRUD）────────────────────────────────────
router.get('/patients/:id/medications', staffAuth, async (req, res) => {
  try {
    const meds = await Medication.find({ user: req.params.id, active: true }).sort({ createdAt: -1 });
    res.json({ success: true, data: meds });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:id/medications', staffAuth, async (req, res) => {
  try {
    const { name, brandName, dosage, method, frequency, timing, startDate, endDate, purpose, note } = req.body;
    if (!name || !dosage || !frequency) return res.status(400).json({ success: false, message: '药品名称、剂量、频次不能为空' });
    const med = await Medication.create({
      user: req.params.id, name, brandName: brandName || '', dosage, method: method || '口服',
      frequency, timing: timing || '', startDate: startDate || '', endDate: endDate || '',
      purpose: purpose || '', note: note || '', createdByStaff: true, staffId: req.staff._id,
    });
    res.status(201).json({ success: true, data: med });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:id/medications/:medId', staffAuth, async (req, res) => {
  try {
    const med = await Medication.findOneAndUpdate(
      { _id: req.params.medId, user: req.params.id },
      { $set: req.body }, { new: true }
    );
    if (!med) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: med });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/patients/:id/medications/:medId', staffAuth, async (req, res) => {
  try {
    await Medication.findOneAndUpdate({ _id: req.params.medId, user: req.params.id }, { active: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 患者营养素管理（医护端 CRUD）──────────────────────────────────
router.get('/patients/:id/supplements', staffAuth, async (req, res) => {
  try {
    const sups = await Supplement.find({ user: req.params.id, stopped: false }).sort({ createdAt: -1 });
    res.json({ success: true, data: sups });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/patients/:id/supplements', staffAuth, async (req, res) => {
  try {
    const { name, brand, dosage, method, frequency, startDate, endDate, purpose, note } = req.body;
    if (!name || !dosage || !frequency) return res.status(400).json({ success: false, message: '名称、剂量、频次不能为空' });
    const sup = await Supplement.create({
      user: req.params.id, name, brand: brand || '', dosage, method: method || '随餐',
      frequency, startDate: startDate || '', endDate: endDate || '',
      purpose: purpose || '', note: note || '', createdByStaff: true, staffId: req.staff._id,
    });
    res.status(201).json({ success: true, data: sup });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.patch('/patients/:id/supplements/:supId', staffAuth, async (req, res) => {
  try {
    const sup = await Supplement.findOneAndUpdate(
      { _id: req.params.supId, user: req.params.id },
      { $set: req.body }, { new: true }
    );
    if (!sup) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: sup });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/patients/:id/supplements/:supId', staffAuth, async (req, res) => {
  try {
    await Supplement.findOneAndUpdate({ _id: req.params.supId, user: req.params.id }, { stopped: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 患者专项筛查结果（医护端查看）────────────────────────────────
router.get('/patients/:id/screening', staffAuth, async (req, res) => {
  try {
    const items = await UserScreeningItem.find({ user: req.params.id }).sort({ recordedAt: -1 });
    res.json({ success: true, data: items });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 患者日常打卡记录（医护端查看）────────────────────────────────
router.get('/patients/:id/health-records', staffAuth, async (req, res) => {
  try {
    const { limit = 30, type, startDate, endDate } = req.query;
    const q = { user: req.params.id };
    if (type) q.type = type;
    if (startDate || endDate) {
      q.recordedAt = {};
      if (startDate) q.recordedAt.$gte = new Date(startDate);
      if (endDate) { const e = new Date(endDate); e.setHours(23, 59, 59, 999); q.recordedAt.$lte = e; }
    }
    const records = await HealthRecord.find(q).sort({ recordedAt: -1 }).limit(Number(limit));
    res.json({ success: true, data: records });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 医护端代患者录入初始健康数据（与用户端格式一致）─────────────────
// POST /api/staff/patients/:id/health-records
router.post('/patients/:id/health-records', staffAuth, async (req, res) => {
  try {
    const { type, value, extra, note } = req.body;
    if (!type || value === undefined) {
      return res.status(400).json({ success: false, message: 'type 和 value 必填' });
    }
    const VALID_TYPES = ['bloodPressure', 'bloodSugar', 'heartRate', 'weight', 'sleep', 'mood'];
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: '无效的数据类型' });
    }
    const TYPE_META = {
      bloodPressure: { category: 'vitals',     label: '血压',  unit: 'mmHg' },
      bloodSugar:    { category: 'vitals',     label: '血糖',  unit: 'mmol/L' },
      heartRate:     { category: 'vitals',     label: '心率',  unit: '次/分' },
      weight:        { category: 'metabolism', label: '体重',  unit: 'kg' },
      sleep:         { category: 'lifestyle',  label: '睡眠',  unit: '小时' },
      mood:          { category: 'lifestyle',  label: '情绪',  unit: '分' },
    };
    const meta = TYPE_META[type];
    const record = await HealthRecord.create({
      user:     req.params.id,
      category: meta.category,
      type,
      label:    meta.label,
      unit:     meta.unit,
      value:    String(value),
      extra:    extra || {},
      note:     note || '',
    });
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 家庭成员关联（需求18）────────────────────────────────────────
// GET /api/staff/patients/:id/family-links
router.get('/patients/:id/family-links', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('familyLinks.linkedUser', 'name phone gender birthDate');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    res.json({ success: true, data: user.familyLinks || [] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/family-links
router.post('/patients/:id/family-links', staffAuth, async (req, res) => {
  try {
    const { linkedUserId, relation } = req.body;
    if (!linkedUserId) return res.status(400).json({ success: false, message: 'linkedUserId 必填' });
    const [userA, userB] = await Promise.all([
      User.findById(req.params.id),
      User.findById(linkedUserId),
    ]);
    if (!userA || !userB) return res.status(404).json({ success: false, message: '患者不存在' });
    // A → B
    if (!userA.familyLinks.find(l => String(l.linkedUser) === String(linkedUserId))) {
      userA.familyLinks.push({ linkedUser: linkedUserId, relation: relation || '' });
      await userA.save();
    }
    // B → A（双向关联）
    if (!userB.familyLinks.find(l => String(l.linkedUser) === String(req.params.id))) {
      userB.familyLinks.push({ linkedUser: req.params.id, relation: relation || '' });
      await userB.save();
    }
    res.json({ success: true, message: '已添加家庭成员关联' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/family-links/:linkId
router.delete('/patients/:id/family-links/:linkId', staffAuth, async (req, res) => {
  try {
    const userA = await User.findById(req.params.id);
    if (!userA) return res.status(404).json({ success: false, message: '患者不存在' });
    const link = userA.familyLinks.id(req.params.linkId);
    if (!link) return res.status(404).json({ success: false, message: '关联不存在' });
    const linkedUserId = link.linkedUser;
    link.deleteOne();
    await userA.save();
    // 反向移除
    const userB = await User.findById(linkedUserId);
    if (userB) {
      const reverse = userB.familyLinks.find(l => String(l.linkedUser) === String(req.params.id));
      if (reverse) { reverse.deleteOne(); await userB.save(); }
    }
    res.json({ success: true, message: '已移除' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 日常健康打卡总览（新增需求）────────────────────────────────────
// GET /api/staff/checkin-overview?date=&patientName=
// 返回当天（默认今天）每位客户的打卡汇总：已打卡项、未打卡项、最近打卡时间
router.get('/checkin-overview', staffAuth, async (req, res) => {
  try {
    const { date, patientName } = req.query;
    const staff = req.staff;

    // 全部打卡类型（与用户端一致）
    const ALL_CHECKIN_TYPES = ['diet','exercise','sleep','weight','bowel','water','smoking','alcohol','bloodPressure','heartRate','bloodSugar'];
    const TYPE_LABEL = { bloodPressure:'血压', bloodSugar:'血糖', weight:'体重', heartRate:'心率', sleep:'睡眠', mood:'情绪', diet:'饮食', exercise:'运动', water:'饮水', bowel:'排便', smoking:'吸烟', alcohol:'饮酒' };

    // 管辖患者
    const patientFilter = {};
    if (staff.role === 'healthManager') patientFilter.assignedHealthManager = staff._id;
    else if (staff.role === 'familyDoctor') patientFilter.assignedFamilyDoctor = staff._id;
    else if (staff.role === 'nutritionist') patientFilter.assignedNutritionist = staff._id;
    if (patientName) patientFilter.name = new RegExp(patientName, 'i');

    const patients = await User.find(patientFilter).select('name phone').lean();
    const patientIds = patients.map(p => p._id);
    const patientMap = {};
    patients.forEach(p => { patientMap[String(p._id)] = p; });

    // 日期范围（默认今天）
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(targetDate); end.setHours(23, 59, 59, 999);

    // 拉取当天所有打卡记录
    const records = await HealthRecord.find({
      user: { $in: patientIds },
      recordedAt: { $gte: start, $lte: end },
    }).select('user type value unit recordedAt imageUrl extra').sort({ recordedAt: -1 }).lean();

    // 按患者分组
    const byPatient = {};
    records.forEach(r => {
      const uid = String(r.user);
      if (!byPatient[uid]) byPatient[uid] = { latestAt: r.recordedAt, types: {} };
      if (r.recordedAt > byPatient[uid].latestAt) byPatient[uid].latestAt = r.recordedAt;
      if (!byPatient[uid].types[r.type]) byPatient[uid].types[r.type] = r; // 取每种类型第一条（最新）
    });

    // 只返回有打卡记录的患者，按最近打卡时间倒序
    const result = Object.entries(byPatient)
      .map(([uid, data]) => {
        const patient = patientMap[uid] || {};
        const doneTypes = Object.keys(data.types);
        const missingTypes = ALL_CHECKIN_TYPES.filter(t => !doneTypes.includes(t));
        return {
          patientId: uid,
          patientName: patient.name || '-',
          patientPhone: patient.phone || '-',
          latestRecordAt: data.latestAt,
          doneItems: doneTypes.map(t => ({
            type: t, label: TYPE_LABEL[t] || t,
            value: data.types[t].value, unit: data.types[t].unit || '',
          })),
          missingItems: missingTypes.map(t => ({ type: t, label: TYPE_LABEL[t] || t })),
        };
      })
      .sort((a, b) => new Date(b.latestRecordAt) - new Date(a.latestRecordAt));

    res.json({ success: true, data: result, total: result.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 用户留言收件箱：查看分配给自己的患者发来的消息 ──────────────────
// GET /api/staff/user-messages
router.get('/user-messages', staffAuth, async (req, res) => {
  try {
    const staff = req.staff;

    // 找到分配给该医护人员的患者
    const myFilter =
      staff.role === 'familyDoctor'    ? { assignedFamilyDoctor: staff._id } :
      staff.role === 'nutritionist'    ? { assignedNutritionist: staff._id } :
      staff.role === 'healthManager' || staff.role === 'medicalAssistant'
                                       ? { assignedHealthManager: staff._id } :
                                         { $or: [ { assignedFamilyDoctor: staff._id }, { assignedHealthManager: staff._id }, { assignedNutritionist: staff._id } ] };

    const myPatients = await User.find(myFilter).select('_id name phone').lean();
    const patientIds = myPatients.map(p => p._id);
    const patientMap = {};
    myPatients.forEach(p => { patientMap[String(p._id)] = p; });

    // 按角色过滤：家庭医生看 doctor 留言，营养师看 nutritionist，其他看 manager
    const recipientFilter =
      staff.role === 'familyDoctor'  ? { recipient: { $in: ['doctor', null, undefined] } } :
      staff.role === 'nutritionist'  ? { recipient: 'nutritionist' } :
      {};

    const messages = await Message.find({ user: { $in: patientIds }, type: 'user', ...recipientFilter })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const result = messages.map(m => ({
      ...m,
      patientName: patientMap[String(m.user)]?.name || '未知',
      patientPhone: patientMap[String(m.user)]?.phone || '',
      staffUnread: !m.staffReadAt,
    }));

    const unreadCount = result.filter(m => m.staffUnread).length;
    res.json({ success: true, data: result, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 获取某用户的对话线程（按 roleKey 区分）────────────────────────
// GET /api/staff/user-messages/:userId/thread?role=manager
router.get('/user-messages/:userId/thread', staffAuth, async (req, res) => {
  try {
    const { role = 'manager' } = req.query;
    const conversationId = `${req.params.userId}_${role}`;
    const messages = await Message.find({ conversationId }).sort({ createdAt: 1 }).limit(100);
    // 标记该会话所有用户消息为医护已读
    await Message.updateMany(
      { conversationId, type: 'user', staffReadAt: null },
      { staffReadAt: new Date() }
    );
    res.json({ success: true, data: messages, conversationId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 标记某用户的留言为医护已读 ──────────────────────────────────────
// PATCH /api/staff/user-messages/:userId/read
router.patch('/user-messages/:userId/read', staffAuth, async (req, res) => {
  try {
    const { role = 'manager' } = req.body;
    const conversationId = `${req.params.userId}_${role}`;
    await Message.updateMany(
      { conversationId, type: 'user', staffReadAt: null },
      { staffReadAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 医护端回复用户留言 ──────────────────────────────────────────────
// POST /api/staff/user-messages/:userId/reply
router.post('/user-messages/:userId/reply', staffAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ success: false, message: '回复内容不能为空' });
    }
    const patient = await User.findById(req.params.userId).select('name');
    if (!patient) return res.status(404).json({ success: false, message: '用户不存在' });

    const staff = req.staff;
    const typeMap = {
      familyDoctor: 'doctor',
      nutritionist: 'nutritionist',
      healthManager: 'manager',
      medicalAssistant: 'manager',
    };
    const msgType = typeMap[staff.role] || 'manager';
    // 根据消息类型确定 conversationId 中的 role key（与用户端发送时一致）
    const roleKey = msgType === 'doctor' ? 'doctor' : msgType === 'nutritionist' ? 'nutritionist' : 'manager';
    const conversationId = `${req.params.userId}_${roleKey}`;
    const senderLabel = staff.title ? `${staff.name}（${staff.title}）` : staff.name;

    const replyMsg = await Message.create({
      user:    req.params.userId,
      type:    msgType,
      sender:  senderLabel,
      title:   `${staff.name} 回复了您的留言`,
      content: content.trim(),
      unread:  true,
      conversationId,
    });

    ssePublish(conversationId, { type: 'message', data: replyMsg });
    res.json({ success: true, message: '回复已发送', data: replyMsg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 我发出的转介（发起方查看进度）───────────────────────────────────
// GET /api/staff/referrals?direction=sent
// 已由 /referrals 路由支持 direction=sent 参数，无需新增路由

// ── 3.1 档案审核：健管专员确认AI自动读取的健康档案信息 ─────────────
// PATCH /api/staff/patients/:id/archive-review
router.patch('/patients/:id/archive-review', staffAuth, async (req, res) => {
  try {
    const { action } = req.body; // 'approve' | 'reset'
    const status = action === 'reset' ? 'pending' : 'reviewed';
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { archiveReviewStatus: status, archiveReviewedAt: new Date(), archiveReviewedBy: req.staff._id } }
    );
    res.json({ success: true, data: { archiveReviewStatus: status } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.2 身体成分保存 ──────────────────────────────────────────────
// PATCH /api/staff/patients/:id/body-composition
router.patch('/patients/:id/body-composition', staffAuth, async (req, res) => {
  try {
    const { skelMuscle, visceralFat, bodyFatRate, measuredAt } = req.body;
    const bc = {};
    if (skelMuscle  !== undefined) bc.skelMuscle  = skelMuscle;
    if (visceralFat !== undefined) bc.visceralFat = visceralFat;
    if (bodyFatRate !== undefined) bc.bodyFatRate  = bodyFatRate;
    if (measuredAt  !== undefined) bc.measuredAt   = measuredAt;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { bodyComposition: bc } }
    );
    res.json({ success: true, data: bc });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.4 AI健康汇总分析：生成 ──────────────────────────────────────
// POST /api/staff/patients/:id/ai-health-summary
router.post('/patients/:id/ai-health-summary', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('assignedHealthManager', 'name')
      .populate('assignedFamilyDoctor', 'name')
      .populate('assignedNutritionist', 'name');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lv = user.labValues || {};
    const bc = user.bodyComposition || {};
    const labSummary = [
      lv.fpg && `空腹血糖 ${lv.fpg} mmol/L`,
      lv.hba1c && `糖化血红蛋白 ${lv.hba1c}%`,
      lv.sbp && `血压 ${lv.sbp}/${lv.dbp} mmHg`,
      lv.tc && `总胆固醇 ${lv.tc} mmol/L`,
      lv.ldl && `LDL-C ${lv.ldl} mmol/L`,
      lv.hdl && `HDL-C ${lv.hdl} mmol/L`,
      lv.tg && `甘油三酯 ${lv.tg} mmol/L`,
      lv.ua && `尿酸 ${lv.ua} μmol/L`,
      lv.alt && `ALT ${lv.alt} U/L`,
      lv.ast && `AST ${lv.ast} U/L`,
      lv.ggt && `GGT ${lv.ggt} U/L`,
      lv.hcy && `同型半胱氨酸 ${lv.hcy} μmol/L`,
      lv.lpla2 && `Lp-PLA2 ${lv.lpla2} U/L`,
      lv.waist && `腰围 ${lv.waist} cm`,
      lv.liverUs && `肝脏超声：${lv.liverUs}`,
      lv.carotiUs && `颈动脉超声：${lv.carotiUs}`,
      bc.skelMuscle && `骨骼肌量 ${bc.skelMuscle} kg`,
      bc.visceralFat && `内脏脂肪 ${bc.visceralFat}`,
      bc.bodyFatRate && `体脂率 ${bc.bodyFatRate}%`,
    ].filter(Boolean).join('、') || '暂无体检数据';

    const prompt = `你是一位经验丰富的家庭医生，请根据以下患者健康档案生成一份专业的健康分析报告。

【患者基本信息】
姓名：${user.name}，性别：${user.gender}，年龄：${user.age || '未知'}岁
慢性病：${user.chronicDiseases?.join('、') || '无'}

【最近体检指标】
${labSummary}

【健康需求】
${user.healthConcern || '未填写'}

【既往史】
${user.healthProfile?.pastHistory || '无'}

请按以下JSON格式输出（仅输出JSON，不要加任何其他文字）：
{
  "trend": "健康趋势分析（100-200字，分析主要指标变化情况和整体健康走势）",
  "risks": "风险提示（100-200字，列出主要异常项及可能后果）",
  "plan": "管理方案初稿（200-300字，包含复查建议、生活方式干预、药物/营养素建议等）"
}`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    let summary = { trend: '', risks: '', plan: '' };
    try {
      const text = message.content[0].text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) summary = JSON.parse(jsonMatch[0]);
    } catch {}

    summary.generatedAt = new Date();
    summary.approvedAt = null;
    summary.approvedBy = null;

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { aiHealthSummary: summary } }
    );
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 4.4 AI健康汇总分析：审核/更新 ────────────────────────────────
// PATCH /api/staff/patients/:id/ai-health-summary
router.patch('/patients/:id/ai-health-summary', staffAuth, async (req, res) => {
  try {
    const { trend, risks, plan, action } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const current = user.aiHealthSummary || {};
    const updated = {
      ...current,
      ...(trend !== undefined ? { trend } : {}),
      ...(risks !== undefined ? { risks } : {}),
      ...(plan  !== undefined ? { plan  } : {}),
    };
    if (action === 'approve') {
      updated.approvedAt = new Date();
      updated.approvedBy = req.staff.name;
    }
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { aiHealthSummary: updated } }
    );
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.3 专项筛查：录入筛查结果（支持图片/PDF上传） ────────────────
// POST /api/staff/patients/:id/screening-records
router.post('/patients/:id/screening-records', staffAuth, uploadScreening.single('file'), async (req, res) => {
  try {
    const { title, screeningCategory, checkDate, hospital, note } = req.body;
    const raw = req.body.reportItems;
    const reportItems = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    if (!title || !screeningCategory) {
      return res.status(400).json({ success: false, message: '标题和筛查分类必填' });
    }
    const fileUrl  = req.file ? `/api/uploads/screening/${req.file.filename}` : '';
    const mimeType = req.file ? req.file.mimetype : '';
    const report = await MedicalReport.create({
      user:             req.params.id,
      title,
      type:             screeningCategory,
      screeningCategory,
      checkDate:        checkDate || '',
      hospital:         hospital  || '',
      reportItems,
      note:             note || '',
      fileUrl,
      mimeType,
      audit_status:     'unaudited',
      uploadedBy:       req.staff._id,
    });
    res.json({ success: true, data: report });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.3 专项筛查结果：按筛查分类查询报告 ─────────────────────────
// GET /api/staff/patients/:id/screening-reports
router.get('/patients/:id/screening-reports', staffAuth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({
      user: req.params.id,
      screeningCategory: { $exists: true, $ne: '' },
    }).sort({ checkDate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: reports });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/staff/screening-tree — 专项筛查三层结构（从管理端套餐动态读取）
router.get('/screening-tree', staffAuth, async (req, res) => {
  try {
    const [cats, pkgs] = await Promise.all([
      ProjectCategory.find({ status: 'active' }).lean(),
      LabTestPackage.find({ status: 'active' })
        .populate('orders', 'name')
        .populate('specialExams', 'name')
        .populate('functionalTests', 'name')
        .lean(),
    ]);
    // 建分类 map
    const catMap = {};
    cats.forEach(c => { catMap[String(c._id)] = c; });
    // 一级分类（无 parent）
    const l1s = cats.filter(c => !c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    // 二级分类（有 parent）
    const l2sByParent = {};
    cats.filter(c => c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(c => {
      const pid = String(c.parent);
      if (!l2sByParent[pid]) l2sByParent[pid] = [];
      l2sByParent[pid].push(c);
    });
    // 套餐按 categoryId 索引（一个子分类对应一个或多个套餐）
    const pkgByCat = {};
    pkgs.forEach(p => {
      if (!p.categoryId) return;
      const cid = String(p.categoryId);
      if (!pkgByCat[cid]) pkgByCat[cid] = [];
      pkgByCat[cid].push(p);
    });
    // 组装三层树
    const tree = l1s.map(l1 => {
      const l1id = String(l1._id);
      const children = (l2sByParent[l1id] || []).map(l2 => {
        const l2id = String(l2._id);
        const matchPkgs = pkgByCat[l2id] || [];
        // 第三层 = 各套餐关联的所有项目名（去重）
        const itemSet = new Set();
        matchPkgs.forEach(p => {
          (p.orders || []).forEach(o => o && o.name && itemSet.add(o.name));
          (p.specialExams || []).forEach(e => e && e.name && itemSet.add(e.name));
          (p.functionalTests || []).forEach(f => f && f.name && itemSet.add(f.name));
        });
        return {
          _id: l2._id,
          label: l2.name,
          items: [...itemSet],
          packageIds: matchPkgs.map(p => p._id),
        };
      });
      return { _id: l1._id, label: l1.name, children };
    });
    res.json({ success: true, data: tree });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
