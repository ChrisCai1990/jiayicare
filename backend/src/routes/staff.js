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
  familyDoctor:    '家庭医师',
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

  const admin = await Admin.findOne({ $or: [{ username }, { phone: username }] }).populate('customRoleId');
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
        phone: admin.phone || '',
        customRoleName: admin.customRoleId?.name || null,
        customPermissions: admin.customRoleId?.permissions || null,
      },
    },
  });
});

// ── GET /api/staff/me ─────────────────────────────────────────────
router.get('/me', staffAuth, async (req, res) => {
  const s = await Admin.findById(req.staff._id).populate('customRoleId');
  if (!s) return res.status(404).json({ success: false, message: '账号不存在' });
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
      phone: s.phone || '',
      customRoleName: s.customRoleId?.name || null,
      customPermissions: s.customRoleId?.permissions || null,
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
    } else if (staff.role === 'specialist') {
      assignFilter.assignedSpecialist = { $in: staffIds };
    } else if (staff.role === 'tcmDoctor') {
      assignFilter.assignedTcmDoctor = { $in: staffIds };
    } else if (staff.role === 'psychologist') {
      assignFilter.assignedPsychologist = { $in: staffIds };
    } else if (staff.role === 'rehabSpecialist') {
      assignFilter.assignedRehabSpecialist = { $in: staffIds };
    } else if (staff.role === 'medicalAssistant') {
      assignFilter.assignedMedicalAssistant = { $in: staffIds };
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
      .select('name phone gender age height weight healthScore servicePackage serviceExpiry chronicDiseases patientType assignedHealthManager assignedFamilyDoctor assignedNutritionist assignedSpecialist assignedTcmDoctor assignedPsychologist assignedRehabSpecialist assignedMedicalAssistant source createdAt contactPhone')
      .populate('assignedHealthManager', 'name title')
      .populate('assignedFamilyDoctor', 'name title')
      .populate('assignedNutritionist', 'name title')
      .populate('assignedSpecialist', 'name title')
      .populate('assignedTcmDoctor', 'name title')
      .populate('assignedPsychologist', 'name title')
      .populate('assignedRehabSpecialist', 'name title')
      .populate('assignedMedicalAssistant', 'name title'),
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
    specialist:       'assignedSpecialist',
    tcmDoctor:        'assignedTcmDoctor',
    psychologist:     'assignedPsychologist',
    rehabSpecialist:  'assignedRehabSpecialist',
    medicalAssistant: 'assignedMedicalAssistant',
    superadmin:       'assignedHealthManager',
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
    assignedSpecialist, assignedTcmDoctor, assignedPsychologist,
    assignedRehabSpecialist, assignedMedicalAssistant,
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
    assignedHealthManager:    hm,
    assignedFamilyDoctor:     fd,
    assignedNutritionist:     nn,
    assignedSpecialist:       assignedSpecialist       || null,
    assignedTcmDoctor:        assignedTcmDoctor        || null,
    assignedPsychologist:     assignedPsychologist     || null,
    assignedRehabSpecialist:  assignedRehabSpecialist  || null,
    assignedMedicalAssistant: assignedMedicalAssistant || null,
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
    .populate('assignedNutritionist', 'name title role')
    .populate('assignedSpecialist', 'name title role')
    .populate('assignedTcmDoctor', 'name title role')
    .populate('assignedPsychologist', 'name title role')
    .populate('assignedRehabSpecialist', 'name title role')
    .populate('assignedMedicalAssistant', 'name title role');
  if (!user) return res.status(404).json({ success: false, message: '会员不存在' });

  // 权限校验：非超管只能查看分配给自己（或下属）的患者
  if (req.staff.role !== 'superadmin') {
    const staffIds = [req.staff._id, ...(await getSubordinateIds(req.staff._id))];
    const matches = (field) => field && staffIds.some(id => id.equals(field._id || field));
    const hasAccess = [
      user.assignedHealthManager, user.assignedFamilyDoctor, user.assignedNutritionist,
      user.assignedSpecialist, user.assignedTcmDoctor, user.assignedPsychologist,
      user.assignedRehabSpecialist, user.assignedMedicalAssistant,
    ].some(matches);
    if (!hasAccess) {
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
    'assignedSpecialist', 'assignedTcmDoctor', 'assignedPsychologist',
    'assignedRehabSpecialist', 'assignedMedicalAssistant',
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
  ['assignedHealthManager', 'assignedFamilyDoctor', 'assignedNutritionist',
   'assignedSpecialist', 'assignedTcmDoctor', 'assignedPsychologist',
   'assignedRehabSpecialist', 'assignedMedicalAssistant'].forEach(k => {
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
    completedAt: (status || 'completed') === 'completed' ? new Date() : null, // 完成态记录完成时间
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
  const OBJECTID_FIELDS = ['assignedTo'];
  allowed.forEach(k => {
    if (req.body[k] !== undefined) {
      // ObjectId 字段传空字符串时设为 null，避免 Mongoose BSONError
      if (OBJECTID_FIELDS.includes(k) && req.body[k] === '') {
        followUp[k] = null;
      } else {
        followUp[k] = req.body[k];
      }
    }
  });
  // 完成时记录完成时间（供用户端「已完成」展示）；非完成态则清空
  if (followUp.status === 'completed') {
    if (!followUp.completedAt) followUp.completedAt = new Date();
  } else {
    followUp.completedAt = null;
  }
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
    const { patientId, title, type, hospital, date, fileUrl, content, mimeType, fileSize, planId, planItemId, screeningL1, screeningL2 } = req.body;
    if (!patientId || !title) return res.status(400).json({ success: false, message: '会员和标题不能为空' });

    // base64 内容限制（约 7MB 原始文件 → 9.3MB base64）
    if (content && content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: '文件过大，请压缩后重试（最大约7MB）' });
    }
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp', 'image/heic', 'image/heif', 'image/bmp'];
    if (mimeType && !ALLOWED_MIME.includes(mimeType)) {
      return res.status(400).json({ success: false, message: `不支持的文件格式（${mimeType}）` });
    }

    const checkDate = date || '';
    const reportYear = checkDate ? new Date(checkDate).getFullYear() : new Date().getFullYear();

    // 如果提供了 screeningL1 + 日期，检查是否已存在同类筛查记录（避免上传报告和手动录入产生两条审核）
    let report;
    if (screeningL1 && checkDate) {
      const existing = await MedicalReport.findOne({ user: patientId, checkDate, screeningL1 });
      if (existing) {
        if (title) existing.title = title;
        if (hospital) existing.hospital = hospital;
        if (fileUrl) {
          existing.fileUrl = fileUrl;
          existing.content = content || '';
          existing.mimeType = mimeType || '';
          existing.fileSize = fileSize || '';
        }
        report = await existing.save();
        if (planId && planItemId) {
          const plan = await HealthPlan.findById(planId);
          if (plan) {
            const item = plan.items.id(planItemId);
            if (item) { item.reportId = report._id; await plan.save(); }
          }
        }
        return res.json({ success: true, data: report });
      }
    }

    report = await MedicalReport.create({
      user: patientId, title, type: type || 'other', hospital: hospital || '',
      date: checkDate, checkDate, reportYear,
      fileUrl: fileUrl || '', content: content || '',
      mimeType: mimeType || '', fileSize: fileSize || '',
      uploadedBy: req.staff._id, audit_status: 'unaudited',
      planId: planId || null, planItemId: planItemId || null,
      screeningL1: screeningL1 || '', screeningL2: screeningL2 || '',
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
    const { title, type, hospital, date, note, aiStatus, screeningCategory, reportYear, reportItems, aiSummary, content, mimeType, fileSize } = req.body;
    // 已审核通过的报告：只允许更新 AI归类（aiStatus/reportItems），其余字段不可改
    if (report.audit_status === 'audited' && (title || type || hospital || date || content)) {
      return res.status(403).json({ success: false, message: '已审核通过的报告不可修改基本信息' });
    }
    if (title !== undefined) report.title = title;
    if (type !== undefined) report.type = type;
    if (hospital !== undefined) report.hospital = hospital;
    if (date !== undefined) report.date = date;
    if (note !== undefined) report.note = note;
    // AI 审核字段
    if (aiStatus !== undefined) { report.aiStatus = aiStatus; report.reviewedAt = new Date(); report.reviewedByStaff = req.staff._id; }
    if (screeningCategory !== undefined) report.screeningCategory = screeningCategory;
    if (reportYear !== undefined) report.reportYear = reportYear;
    if (reportItems !== undefined) report.reportItems = reportItems;
    if (aiSummary !== undefined) report.aiSummary = aiSummary;
    // 补传/替换文件
    if (content !== undefined) {
      if (content && content.length > 10 * 1024 * 1024) return res.status(400).json({ success: false, message: '文件过大，最大约7MB' });
      report.content = content;
    }
    if (mimeType !== undefined) report.mimeType = mimeType;
    if (fileSize !== undefined) report.fileSize = fileSize;
    await report.save();

    // 提交审核（reviewed）或手动更新归类时，重新同步专项筛查
    if (aiStatus === 'reviewed' || (reportItems !== undefined && report.user)) {
      await syncScreeningItems(report.user, report._id, report.reportItems);
    }

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/staff/medical-reports/:id — 删除报告（审核前可删）
router.delete('/medical-reports/:id', staffAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    if (report.audit_status === 'audited') return res.status(403).json({ success: false, message: '已审核通过的报告不可删除' });
    await report.deleteOne();
    res.json({ success: true });
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

// 报告文件上传（图片 + PDF，最大 100MB）
const uploadReportFile = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(UPLOADS_DIR, 'reports');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.bin';
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`不支持的文件格式（${file.mimetype}）`));
  },
});

// POST /api/staff/upload/report-file
router.post('/upload/report-file', staffAuth, uploadReportFile.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '未收到文件' });
  const url = `/api/uploads/reports/${req.file.filename}`;
  res.json({ success: true, data: { url, mimeType: req.file.mimetype, fileSize: req.file.size } });
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

// POST /api/staff/service-records/:id/supplement — 追加补充记录
router.post('/service-records/:id/supplement', staffAuth, async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
    const { content, date } = req.body;
    if (!content) return res.status(400).json({ success: false, message: '内容不能为空' });
    record.supplements.push({ content, date: date ? new Date(date) : new Date(), staffName: req.staff.name, staffId: req.staff._id });
    await record.save();
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/staff/service-records/:id/supplement/:suppId — 编辑补充记录（仅本人）
router.put('/service-records/:id/supplement/:suppId', staffAuth, async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
    const supp = record.supplements.id(req.params.suppId);
    if (!supp) return res.status(404).json({ success: false, message: '补充记录不存在' });
    if (String(supp.staffId) !== String(req.staff._id)) return res.status(403).json({ success: false, message: '只能编辑自己的补充记录' });
    const { content, date } = req.body;
    if (content !== undefined) supp.content = content;
    if (date !== undefined) supp.date = new Date(date);
    await record.save();
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/service-records/:id/supplement/:suppId — 删除补充记录（仅本人）
router.delete('/service-records/:id/supplement/:suppId', staffAuth, async (req, res) => {
  try {
    const record = await ServiceRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
    const supp = record.supplements.id(req.params.suppId);
    if (!supp) return res.status(404).json({ success: false, message: '补充记录不存在' });
    if (String(supp.staffId) !== String(req.staff._id)) return res.status(403).json({ success: false, message: '只能删除自己的补充记录' });
    supp.deleteOne();
    await record.save();
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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
  await Admin.findByIdAndUpdate(req.staff._id, { $set: update });
  const s = await Admin.findById(req.staff._id).select('-password');
  res.json({ success: true, data: { _id: s._id, name: s.name, role: s.role, title: s.title, department: s.department, avatar: s.avatar, region: s.region, phone: s.phone || '' } });
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
  const { productIds, patientIds, pricedProducts } = req.body;
  if (!productIds?.length) return res.status(400).json({ success: false, message: '请选择产品' });
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const products = await Product.find({ _id: { $in: productIds } });
  if (!products.length) return res.status(404).json({ success: false, message: '产品不存在' });
  const priceMap = {};
  if (pricedProducts?.length) {
    pricedProducts.forEach(pp => { priceMap[String(pp.productId)] = pp.price });
  }
  const productItems = products.map(p => ({
    productId: p._id.toString(), name: p.name,
    price: priceMap[p._id.toString()] ?? p.originalPrice, category: p.category, icon: '🛍',
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
    .sort({ createdAt: 1 })
    .populate('uploadedBy', 'name role');

  // 显示层去重：同一 (checkDate, screeningL1) 的两条记录合并为一条
  const keyMap = {};
  const result = [];
  for (const r of reports) {
    const key = r.screeningL1 && r.checkDate ? `${r.checkDate}|${String(r.screeningL1)}` : null;
    if (key && keyMap[key]) {
      const primary = keyMap[key];
      if (!primary.fileUrl && r.fileUrl) { primary.fileUrl = r.fileUrl; primary.mimeType = r.mimeType; }
      if ((r.reportItems?.length || 0) > (primary.reportItems?.length || 0)) primary.reportItems = r.reportItems;
    } else {
      const obj = r.toObject();
      if (key) keyMap[key] = obj;
      result.push(key ? keyMap[key] : obj);
    }
  }
  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 同日参考文件：没有文件的录入记录，附上同一天有文件的报告作为审核参考
  const dateFileMap = {};
  for (const r of result) {
    if (r.fileUrl && r.checkDate && !dateFileMap[r.checkDate]) {
      dateFileMap[r.checkDate] = { _id: r._id, fileUrl: r.fileUrl, mimeType: r.mimeType, title: r.title };
    }
  }
  for (const r of result) {
    if (!r.fileUrl && r.checkDate && dateFileMap[r.checkDate]) {
      r.sharedFile = dateFileMap[r.checkDate];
    }
  }

  res.json({ success: true, data: result });
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

// GET /api/staff/referrals?direction=sent|received&status=&patientId=
router.get('/referrals', staffAuth, async (req, res) => {
  const { direction = 'received', status = '', page = 1, limit = 20, patientId = '' } = req.query;
  let filter;
  if (patientId) {
    // 会员维度：该患者的所有转介记录
    filter = { patientId };
  } else {
    filter = direction === 'sent'
      ? { fromStaffId: req.staff._id }
      : { toStaffId: req.staff._id };
  }
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

// PATCH /api/staff/referrals/mark-sent-read — A清除"已回复"未读标记
router.patch('/referrals/mark-sent-read', staffAuth, async (req, res) => {
  await Referral.updateMany({ fromStaffId: req.staff._id, fromStaffUnread: true }, { $set: { fromStaffUnread: false } });
  res.json({ success: true });
});

// PATCH /api/staff/referrals/:id — 更新转介状态（接收/完成/拒绝）
router.patch('/referrals/:id', staffAuth, async (req, res) => {
  const { status, response, responseAnalysis, responseOpinion } = req.body;
  const referral = await Referral.findOne({ _id: req.params.id, toStaffId: req.staff._id });
  if (!referral) return res.status(404).json({ success: false, message: '转介记录不存在或无权操作' });
  if (status) referral.status = status;
  if (response !== undefined && response.trim()) referral.response = response.trim();
  if (responseAnalysis !== undefined) referral.responseAnalysis = responseAnalysis.trim();
  if (responseOpinion !== undefined) referral.responseOpinion = responseOpinion.trim();
  referral.respondedAt = new Date();
  referral.fromStaffUnread = true; // 通知发起方有新回复
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

  const [recentPushes, pendingReferrals, expiringPatients, unreadReferralCount, unreadRepliedCount] = await Promise.all([
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
    // 收到的待处理转介数量
    Referral.countDocuments({ toStaffId: staff._id, status: 'pending' }),
    // 我发出的转介、对方已回复但我未查看
    Referral.countDocuments({ fromStaffId: staff._id, fromStaffUnread: true }),
  ]);

  res.json({
    success: true,
    data: {
      recentPushes,
      pendingReferrals,
      expiringPatients,
      unreadReferralCount,
      unreadRepliedCount,
      summary: {
        pushCount: recentPushes.length,
        pendingReferralCount: unreadReferralCount,
        unreadRepliedCount,
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
    const { year, planType } = req.query;
    const query = { patientId: req.params.id };
    if (year) query.year = parseInt(year);
    // 指定 planType → 返回该类型单份；否则返回该年度全部类型的方案数组
    if (planType !== undefined && planType !== '') {
      query.planType = planType;
      const plan = await AnnualPlan.findOne(query);
      return res.json({ success: true, data: plan || null });
    }
    const plans = await AnnualPlan.find(query).sort({ year: -1, updatedAt: -1 });
    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/patients/:id/annual-plan', staffAuth, async (req, res) => {
  try {
    const { planType, moduleData, notes, year } = req.body;
    if (!planType) return res.status(400).json({ success: false, message: '缺少方案类型' });
    const targetYear = year || new Date().getFullYear();
    // 按「患者+年度+方案类型」定位，4个类型各存一份，互不覆盖
    const plan = await AnnualPlan.findOneAndUpdate(
      { patientId: req.params.id, year: targetYear, planType },
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
    const { year, planType } = req.query;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const query = { patientId: req.params.id, year: targetYear };
    if (planType) query.planType = planType;
    const plan = await AnnualPlan.findOneAndUpdate(
      query,
      { pushedAt: new Date(), pushedBy: req.staff._id },
      { new: true }
    );
    if (!plan) return res.status(404).json({ success: false, message: '方案不存在，请先保存' });
    const PLAN_TYPE_NAMES = {
      health_reshape: '健康重塑方案', young_state: '健康年轻态方案',
      chronic_stable: '慢病维稳方案', health_prevention: '健康预防方案',
    };
    const typeName = PLAN_TYPE_NAMES[plan.planType] || '健康管理方案';
    const pushTitle = `${targetYear}年度${typeName}`;
    // 同步写 PushRecord，让用户在消息中心收到通知（每个类型独立一条）
    const existing = await PushRecord.findOne({ patientId: req.params.id, type: 'plan', questionnaireId: null,
      title: pushTitle });
    if (!existing) {
      await PushRecord.create({
        staffId: req.staff._id, patientId: req.params.id,
        type: 'plan',
        title: pushTitle,
        content: `您的${typeName}已发布，请前往"健康方案"查看。`,
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
    const items = await UserScreeningItem.find({ user: req.params.id })
      .sort({ updatedAt: -1 })
      .populate('reportId', 'checkDate institution title reportItems');

    // 把 reportItem 的实际检查内容附加到每条 screeningItem
    const enriched = items.map(item => {
      const obj = item.toObject();
      const report = obj.reportId;
      if (report) {
        obj.checkDate = report.checkDate || '';
        obj.institution = report.institution || '';
        obj.reportTitle = report.title || '';
        // 在该报告的 reportItems 里找 screeningKey 匹配的条目
        const matched = (report.reportItems || []).find(ri =>
          (ri.screeningKeys && ri.screeningKeys.includes(obj.itemId)) ||
          ri.screeningKey === obj.itemId
        );
        if (matched) {
          obj.value = matched.value || '';
          obj.unit = matched.unit || '';
          obj.referenceRange = matched.referenceRange || '';
          obj.status = matched.status || 'unknown';
          obj.findings = matched.findings || '';
          obj.diagnosis = matched.diagnosis || '';
          obj.conclusion = matched.conclusion || '';
          obj.itemType = matched.itemType || 'lab';
          obj.name = matched.name || obj.itemLabel;
        }
        obj.reportId = String(report._id); // 保持为 string ID
      }
      return obj;
    });

    res.json({ success: true, data: enriched });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/screening/ai-item — 删除 AI 识别的 UserScreeningItem（按 reportId + itemLabel 批量删）
router.delete('/patients/:id/screening/ai-item', staffAuth, async (req, res) => {
  try {
    const { reportId, itemLabel } = req.body;
    const q = { user: req.params.id };
    if (reportId) q.reportId = reportId;
    if (itemLabel) q.itemLabel = itemLabel;
    const result = await UserScreeningItem.deleteMany(q);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/screening/dedup — 去重：同一 itemId 保留最新一条（updatedAt最大）
router.post('/patients/:id/screening/dedup', staffAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const all = await UserScreeningItem.find({ user: userId }).sort({ updatedAt: -1 }).lean();
    const seen = new Set();
    const toDelete = [];
    for (const it of all) {
      if (seen.has(it.itemId)) {
        toDelete.push(it._id);
      } else {
        seen.add(it.itemId);
      }
    }
    if (toDelete.length) {
      await UserScreeningItem.deleteMany({ _id: { $in: toDelete } });
    }
    res.json({ success: true, deleted: toDelete.length, message: `已清理 ${toDelete.length} 条重复记录` });
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
    const TYPE_META = {
      bloodPressure: { category: 'vitals',     label: '血压',  unit: 'mmHg' },
      bloodSugar:    { category: 'vitals',     label: '血糖',  unit: 'mmol/L' },
      heartRate:     { category: 'vitals',     label: '心率',  unit: '次/分' },
      weight:        { category: 'metabolism', label: '体重',  unit: 'kg' },
      sleep:         { category: 'lifestyle',  label: '睡眠',  unit: '小时' },
      mood:          { category: 'lifestyle',  label: '情绪',  unit: '分' },
      diet:          { category: 'lifestyle',  label: '饮食',  unit: '' },
      exercise:      { category: 'lifestyle',  label: '运动',  unit: '' },
      water:         { category: 'lifestyle',  label: '饮水',  unit: '' },
      bowel:         { category: 'lifestyle',  label: '排便',  unit: '' },
      smoking:       { category: 'lifestyle',  label: '吸烟',  unit: '' },
      alcohol:       { category: 'lifestyle',  label: '饮酒',  unit: '' },
    };
    if (!TYPE_META[type]) {
      return res.status(400).json({ success: false, message: '无效的数据类型' });
    }
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

    // 按角色过滤：家庭医师看 doctor 留言，营养师看 nutritionist，其他看 manager
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

// ── 4.2 身体成分历史记录：编辑 ──────────────────────────────────────
// PATCH /api/staff/patients/:id/body-composition-history/:index
router.patch('/patients/:id/body-composition-history/:index', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const idx = parseInt(req.params.index);
    const history = user.bodyCompHistory || [];
    if (idx < 0 || idx >= history.length) return res.status(400).json({ success: false, message: '索引越界' });
    const { skelMuscle, visceralFat, bodyFatRate, measuredAt } = req.body;
    const entry = { ...history[idx] };
    if (skelMuscle  !== undefined) entry.skelMuscle  = skelMuscle;
    if (visceralFat !== undefined) entry.visceralFat = visceralFat;
    if (bodyFatRate !== undefined) entry.bodyFatRate  = bodyFatRate;
    if (measuredAt  !== undefined) entry.measuredAt   = measuredAt;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`bodyCompHistory.${idx}`]: entry } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.2 身体成分历史记录：删除 ──────────────────────────────────────
// DELETE /api/staff/patients/:id/body-composition-history/:index
router.delete('/patients/:id/body-composition-history/:index', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const idx = parseInt(req.params.index);
    const history = [...(user.bodyCompHistory || [])];
    if (idx < 0 || idx >= history.length) return res.status(400).json({ success: false, message: '索引越界' });
    history.splice(idx, 1);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { bodyCompHistory: history } }
    );
    res.json({ success: true });
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

    const { chat } = require('../utils/ai');
    const MedicalReport = require('../models/MedicalReport');

    const lv = user.labValues || {};
    const bc = user.bodyComposition || {};
    const labLines = [
      lv.fpg   && `空腹血糖 ${lv.fpg} mmol/L`,
      lv.hba1c && `糖化血红蛋白 ${lv.hba1c}%`,
      lv.sbp   && `血压 ${lv.sbp}/${lv.dbp} mmHg`,
      lv.tc    && `总胆固醇 ${lv.tc} mmol/L`,
      lv.ldl   && `LDL-C ${lv.ldl} mmol/L`,
      lv.hdl   && `HDL-C ${lv.hdl} mmol/L`,
      lv.tg    && `甘油三酯 ${lv.tg} mmol/L`,
      lv.ua    && `尿酸 ${lv.ua} μmol/L`,
      lv.alt   && `ALT ${lv.alt} U/L`,
      lv.ast   && `AST ${lv.ast} U/L`,
      lv.ggt   && `GGT ${lv.ggt} U/L`,
      lv.hcy   && `同型半胱氨酸 ${lv.hcy} μmol/L`,
      lv.lpla2 && `Lp-PLA2 ${lv.lpla2} U/L`,
      lv.waist && `腰围 ${lv.waist} cm`,
      lv.liverUs  && `肝脏超声：${lv.liverUs}`,
      lv.carotiUs && `颈动脉超声：${lv.carotiUs}`,
      bc.skelMuscle  && `骨骼肌量 ${bc.skelMuscle} kg`,
      bc.visceralFat && `内脏脂肪 ${bc.visceralFat}`,
      bc.bodyFatRate && `体脂率 ${bc.bodyFatRate}%`,
    ].filter(Boolean);
    const labSummary = labLines.join('、') || '暂无体检数据';

    // 所有专项筛查报告（不限条数，按检查日期倒序）
    const allReports = await MedicalReport.find({ user: req.params.id })
      .sort({ checkDate: -1, date: -1, createdAt: -1 })
      .select('title screeningL2 examConclusion checkDate date reportYear screeningCategory reportItems note');

    // 按年份分组，每项取最新一次
    const reportsByYear = {};
    allReports.forEach(r => {
      const dateStr = r.checkDate || r.date || '';
      const year = r.reportYear || (dateStr ? dateStr.slice(0, 4) : null);
      if (!year) return;
      if (!reportsByYear[year]) reportsByYear[year] = [];
      reportsByYear[year].push(r);
    });
    const reportSummaryLines = [];
    Object.keys(reportsByYear).sort((a, b) => b - a).forEach(year => {
      reportSummaryLines.push(`▶ ${year}年：`);
      reportsByYear[year].forEach(r => {
        const conclusion = r.examConclusion ? r.examConclusion.slice(0, 150) : (r.note ? r.note.slice(0, 100) : '未记录结论');
        const abnormal = (r.reportItems || []).filter(i => i.status === 'abnormal').map(i => i.name).join('、');
        const dateStr = (r.checkDate || r.date || '').slice(0, 10);
        reportSummaryLines.push(`  - ${r.screeningL2 || r.title}（${dateStr}）：${conclusion}${abnormal ? '；异常项：' + abnormal : ''}`);
        // 检查项目（影像/内镜）完整检查所见+诊断意见，供 AI 做结节/斑块/分级历年变化对比
        (r.reportItems || []).filter(i => i.itemType === 'imaging' && (i.findings || i.diagnosis)).forEach(img => {
          const f = (img.findings || '').slice(0, 200);
          const d = (img.diagnosis || '').slice(0, 100);
          reportSummaryLines.push(`     · ${img.name}${img.bodyPart ? `(${img.bodyPart})` : ''}：检查所见「${f}」${d ? `；诊断「${d}」` : ''}`);
        });
      });
    });
    const reportSummary = reportSummaryLines.length > 0 ? reportSummaryLines.join('\n') : '暂无专项筛查记录';

    // 体检指标历史趋势（最近3年）
    const labHistory = (user.labHistory || [])
      .filter(h => h.recordedAt)
      .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
      .slice(0, 5);
    const labTrendLines = labHistory.length > 1
      ? labHistory.map(h => {
          const yr = new Date(h.recordedAt).getFullYear();
          const vals = [
            h.sbp   && `血压${h.sbp}/${h.dbp}`,
            h.fpg   && `空腹血糖${h.fpg}`,
            h.hba1c && `糖化${h.hba1c}%`,
            h.tc    && `总胆固醇${h.tc}`,
            h.ldl   && `LDL${h.ldl}`,
            h.ua    && `尿酸${h.ua}`,
            h.alt   && `ALT${h.alt}`,
          ].filter(Boolean).join('、');
          return `  ${yr}年（${String(h.recordedAt).slice(0,10)}）：${vals || '无数据'}`;
        }).join('\n')
      : '  仅有当次数据，无法比较趋势';

    // 生活方式（膳食调查-综合概述 + 各维度）——用于「生活方式评估」板块
    const ls  = user.lifestyle || {};
    const lsd = user.lifestyle_data || {};
    const dietOverview = lsd.summaryOverride
      || (Array.isArray(lsd.autoSummaryFlags) && lsd.autoSummaryFlags.length ? lsd.autoSummaryFlags.join('；') : '')
      || ls.diet || '';
    const lifestyleSummary = [
      dietOverview && `膳食调查综合概述：${dietOverview}`,
      ls.diet     && `饮食：${ls.diet}`,
      ls.exercise && `运动：${ls.exercise}`,
      ls.sleep    && `睡眠：${ls.sleep}`,
      ls.water    && `饮水：${ls.water}`,
      ls.alcohol  && `饮酒：${ls.alcohol}`,
      ls.smoking  && `吸烟：${ls.smoking}`,
      ls.bowel    && `排便：${ls.bowel}`,
      ls.mood     && `情绪：${ls.mood}`,
    ].filter(Boolean).join('\n') || '暂无生活方式/膳食调查数据';

    // 健康档案（既往史/家族史/近期症状等）
    const hp = user.healthProfile || {};
    const archiveSummary = [
      hp.pastHistory && `既往史：${hp.pastHistory}`,
      hp.familyHistoryNote && `家族史：${hp.familyHistoryNote}`,
      Array.isArray(hp.recentSymptoms) && hp.recentSymptoms.length && `近3个月躯体症状：${hp.recentSymptoms.join('、')}`,
      hp.drugAllergy && `药物过敏：${hp.drugAllergy}`,
    ].filter(Boolean).join('\n') || '无特殊记录';

    const prompt = `你是一位经验丰富的家庭医师，请根据以下患者完整健康档案生成结构化综合健康分析报告。

分析原则：以【最近一次体检关键指标】为立足点判断当前健康状态，结合【历年体检指标趋势】和【历年专项筛查报告】判断变化方向与风险演进，并结合【健康档案】【生活方式与膳食调查】综合评估。专项筛查报告中的检查所见（影像/内镜）请重点比对历年变化趋势，如结节大小/形态变化、颈动脉斑块变化、甲状腺TI-RADS分级变化等。

【患者基本信息】
姓名：${user.name}，性别：${user.gender}，年龄：${user.age || '未知'}岁
慢性病标签：${user.chronicDiseases?.join('、') || '无'}
健康诉求：${user.healthConcern || '未填写'}

【健康档案】
${archiveSummary}

【生活方式与膳食调查】
${lifestyleSummary}

【最近一次体检关键指标】（分析立足点）
${labSummary}

【历年体检指标趋势（近几年记录）】
${labTrendLines}

【历年专项筛查报告（按年份列出所有记录）】
${reportSummary}

请严格按以下JSON格式输出，仅输出JSON，不要添加任何其他内容：
{
  "sections": {
    "lifestyle_assessment": {
      "items": [
        {
          "dimension": "饮食",
          "finding": "结合膳食调查数据与体检指标描述饮食现状；若无数据，说明暂无膳食调查信息并给出通用评估",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "运动",
          "finding": "描述运动习惯现状；若无记录，说明暂无运动数据并结合体检指标（如BMI/血糖/血压）推断运动需求",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "睡眠",
          "finding": "描述睡眠质量现状；若无记录，说明暂无睡眠数据并结合档案信息评估",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "烟酒",
          "finding": "描述吸烟饮酒情况；若无记录，注明暂无相关信息",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        },
        {
          "dimension": "情绪",
          "finding": "描述情绪/心理状态；若无记录，结合慢病状态与档案信息进行综合判断",
          "risk": "该维度相关的健康风险",
          "suggestion": "具体可执行的改善建议"
        }
      ],
      "summary": "生活方式综合评估（50-100字，需结合最近一次体检结果，必须覆盖饮食/运动/睡眠/烟酒/情绪5个维度）"
    },
    "medical_priority": {
      "items": [
        {
          "name": "问题名称（如：血压控制不佳）",
          "current": "当前数值描述（如：152/98mmHg）",
          "meaning": "临床意义（30-60字）",
          "action": "建议行动（具体可执行）",
          "department": "建议就诊科室",
          "urgency": "high或medium或low"
        }
      ]
    },
    "tumor_risk": {
      "completed": ["已完成的筛查项目（含年份）"],
      "abnormal": ["异常发现（有则填，无则空数组）"],
      "missing": ["未覆盖的重要筛查项目"],
      "summary": "肿瘤筛查总评（50-100字）"
    },
    "cardiovascular_risk": {
      "high": ["高风险因素（有则填，无则空数组）"],
      "medium": ["中风险因素（有则填，无则空数组）"],
      "summary": "心脑血管综合评估（50-100字）"
    },
    "chronic_disease": {
      "items": [
        {
          "name": "系统或指标名称",
          "value": "当前值描述",
          "status": "abnormal或mild_abnormal或normal",
          "note": "简要说明（30字内）"
        }
      ]
    },
    "checkup_completeness": {
      "covered": ["已覆盖的主要筛查项目"],
      "missing": ["缺失的重要筛查项目"],
      "suggestion": "下年度体检补项建议（50字内）"
    }
  }
}`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 2500 });

    let sections = null;
    try {
      const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        sections = parsed.sections || parsed;
      }
    } catch {}

    if (!sections) sections = {
      lifestyle_assessment: { items: [], summary: '' },
      medical_priority: { items: [] },
      tumor_risk: { completed: [], abnormal: [], missing: [], summary: '' },
      cardiovascular_risk: { high: [], medium: [], summary: '' },
      chronic_disease: { items: [] },
      checkup_completeness: { covered: [], missing: [], suggestion: '' },
    };

    // 按年度归档：body.year 指定生成的年度，默认当前年
    const year = String(req.body.year || new Date().getFullYear());
    const existing = user.aiHealthSummary || {};
    const byYear = { ...(existing.byYear || {}) };
    // 旧数据迁移：有顶层 sections 但无 byYear，先归档到其原年份（默认2026）
    if (existing.sections && Object.keys(byYear).length === 0) {
      const oy = String(existing.generatedAt ? new Date(existing.generatedAt).getFullYear() : 2026);
      byYear[oy] = { sections: existing.sections, generatedAt: existing.generatedAt || null, approvedAt: existing.approvedAt || null, approvedBy: existing.approvedBy || null };
    }
    byYear[year] = { sections, generatedAt: new Date(), approvedAt: null, approvedBy: null, doctorApprovedAt: null, doctorApprovedBy: null, nutritionApprovedAt: null, nutritionApprovedBy: null };
    const summary = { sections, generatedAt: new Date(), approvedAt: null, approvedBy: null, doctorApprovedAt: null, doctorApprovedBy: null, nutritionApprovedAt: null, nutritionApprovedBy: null, byYear, latestYear: year };

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
    const { sections, sectionNotes, action, scope, year } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const current = user.aiHealthSummary || {};
    const updated = { ...current };
    const byYear = { ...(updated.byYear || {}) };
    // 编辑/审核针对具体年度（默认顶层年度或当前年）
    const y = String(year || updated.latestYear || (updated.generatedAt ? new Date(updated.generatedAt).getFullYear() : new Date().getFullYear()));
    const entry = { ...(byYear[y] || {}) };
    if (sections !== undefined) entry.sections = sections;
    if (sectionNotes !== undefined) entry.sectionNotes = sectionNotes;
    // 审核：按角色维度拆分（家庭医师审5维 / 营养师审生活方式评估）
    // scope: 'doctor' | 'nutrition' | 'all'（缺省=all，兼容旧前端）
    if (action === 'approve') {
      const now = new Date();
      const sc = scope || 'all';
      if (sc === 'doctor' || sc === 'all') { entry.doctorApprovedAt = now; entry.doctorApprovedBy = req.staff.name; }
      if (sc === 'nutrition' || sc === 'all') { entry.nutritionApprovedAt = now; entry.nutritionApprovedBy = req.staff.name; }
      // 两个维度都已审核 → 置整体已审核（供 ai-annual-plan 等下游判断）
      if (entry.doctorApprovedAt && entry.nutritionApprovedAt) {
        entry.approvedAt = now; entry.approvedBy = req.staff.name;
      }
    }
    byYear[y] = entry;
    updated.byYear = byYear;
    // 同步顶层指向被编辑年度（兼容 ai-annual-plan 读取 ais.sections）
    if (sections !== undefined) updated.sections = sections;
    if (sectionNotes !== undefined) updated.sectionNotes = sectionNotes;
    if (action === 'approve') {
      updated.doctorApprovedAt = entry.doctorApprovedAt; updated.doctorApprovedBy = entry.doctorApprovedBy;
      updated.nutritionApprovedAt = entry.nutritionApprovedAt; updated.nutritionApprovedBy = entry.nutritionApprovedBy;
      if (entry.approvedAt) { updated.approvedAt = entry.approvedAt; updated.approvedBy = entry.approvedBy; }
    }
    updated.latestYear = y;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { aiHealthSummary: updated } }
    );
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.5 AI管理方案生成 ──────────────────────────────────────────
// POST /api/staff/patients/:id/ai-annual-plan
router.post('/patients/:id/ai-annual-plan', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const ais = user.aiHealthSummary;
    if (!ais || !ais.sections) {
      return res.status(400).json({ success: false, message: '请先生成AI汇总分析报告' });
    }

    // 各方案类型包含的板块（与前端 AnnualMgmtPlanPage 的 PLAN_TYPE_MODULES 保持一致）
    // 只生成所选方案类型对应的板块，不生成其它类型的板块
    const PLAN_TYPE_MODULES = {
      health_reshape:    ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup'],
      young_state:       ['abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup'],
      chronic_stable:    ['abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup'],
      health_prevention: ['abnormal_followup', 'vaccine', 'monitoring', 'annual_checkup'],
    };
    // 后端实际能生成的板块全集
    const GENERATABLE = ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'monitoring', 'lifestyle', 'annual_checkup'];
    const planType = req.body.planType || '';
    const allowedKeys = (PLAN_TYPE_MODULES[planType] || GENERATABLE).filter(k => GENERATABLE.includes(k));

    const { chat } = require('../utils/ai');
    const s = ais.sections;
    const year = new Date().getFullYear();

    const medPriorityText = (s.medical_priority?.items || [])
      .map(i => `【${i.urgency === 'high' ? '高' : i.urgency === 'medium' ? '中' : '低'}】${i.name}：${i.current}，建议${i.action}，科室：${i.department}`)
      .join('\n') || '无';

    const abnormalText = [
      ...(s.tumor_risk?.abnormal || []),
      ...(s.cardiovascular_risk?.high || []),
      ...(s.chronic_disease?.items || []).filter(i => i.status === 'abnormal').map(i => `${i.name}：${i.value || ''}（${i.note || ''}）`),
    ].join('\n') || '无';

    const chronicText = (s.chronic_disease?.items || [])
      .map(i => `${i.name}：${i.value || ''}（${i.note || ''}）`).join('；') || '无';

    const missingCheckups = (s.checkup_completeness?.missing || []).join('、') || '无';

    const prompt = `你是一位家庭医师，请根据以下AI汇总分析，生成${year}年度健康管理方案，按指定JSON格式输出各板块字段。

【需优先解决的医疗问题】
${medPriorityText}

【异常指标】
${abnormalText}

【慢病及其他指标】
${chronicText}

【缺失体检项目】
${missingCheckups}

【患者慢病标签】${user.chronicDiseases?.join('、') || '无'}

请严格按以下JSON格式输出，仅输出JSON：
{
  "medical_treatment": [
    { "reason": "就医原因", "department": "就诊科室", "visit_time": "${year}-07-15", "notes": "注意事项（如带齐历次体检报告）" }
  ],
  "specialist_collab": [],
  "abnormal_followup": [
    { "items": "复查项目名称", "reason": "复查原因", "time": "${year}-09-15", "notes": "注意事项（如需空腹）" }
  ],
  "vaccine": [
    { "name": "疫苗名称", "time": "${year}-10-15", "reason": "接种原因" }
  ],
  "monitoring": [
    { "items": "监测项目", "frequency": "每日1次", "time": "每天早晨", "notes": "注意事项" }
  ],
  "lifestyle": { "focus": "干预重点（饮食、运动、睡眠等）", "time": "${year}年全年" },
  "annual_checkup": { "focus": "重点关注项目", "date": "${year + 1}-06-01", "escort": false }
}

注意：medical_treatment仅填高优先级就医需求；specialist_collab有会诊需求才填；monitoring根据慢病标签确定项目；无相关内容用空数组。`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 2000 });

    let raw = {};
    try {
      const jsonMatch = text.trim().match(/\{[\s\S]*\}/);
      if (jsonMatch) raw = JSON.parse(jsonMatch[0]);
    } catch {}

    // 转为 moduleData 结构（多条板块用 { records: [...] }）
    // 只输出当前所选方案类型包含的板块，其余板块不生成
    const result = {};
    ['medical_treatment', 'specialist_collab', 'abnormal_followup', 'vaccine', 'monitoring'].forEach(key => {
      if (!allowedKeys.includes(key)) return;
      result[key] = { records: Array.isArray(raw[key]) ? raw[key] : [] };
    });
    if (allowedKeys.includes('lifestyle') && raw.lifestyle) result.lifestyle = { enabled: true, ...raw.lifestyle };
    if (allowedKeys.includes('annual_checkup') && raw.annual_checkup) result.annual_checkup = { enabled: true, ...raw.annual_checkup };

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 场景七：AI 辅助生成文案草稿（随访记录 / 服务记录 / 方案描述） ──────
// POST /api/staff/patients/:id/ai-draft   body: { kind, context }
// kind: followup | service_record | plan_desc
// 仅生成草稿返回前端，由医护人员审核修改后保存，不自动写入
router.post('/patients/:id/ai-draft', staffAuth, async (req, res) => {
  try {
    const { kind, context = {} } = req.body;
    const VALID = ['followup', 'service_record', 'plan_desc'];
    if (!VALID.includes(kind)) return res.status(400).json({ success: false, message: '未知的草稿类型' });

    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthConcern healthProfile');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    const baseInfo = `姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}`;

    let prompt;
    if (kind === 'followup') {
      const since = new Date(Date.now() - 14 * 86400000);
      const records = await HealthRecord.find({ user: user._id, recordedAt: { $gte: since } })
        .sort({ recordedAt: -1 }).limit(40).lean();
      const recLines = records.length
        ? records.map(r => `${String(r.recordedAt).slice(0, 10)} ${r.label}：${r.value}${r.unit || ''}${r.status && r.status !== 'normal' ? `（${r.status === 'danger' ? '异常' : '偏高/偏低'}）` : ''}`).join('\n')
        : '近14天无打卡数据';
      prompt = `你是健康管理随访人员，请根据以下信息撰写一段专业、简洁、有温度的随访记录草稿（150-250字，自然语言连贯成段，不要分点编号，不要使用Markdown）。

【患者】${baseInfo}
【随访主题】${context.theme || '常规随访'}
【随访方式】${context.type || '电话'}
【随访重点】${context.focus || '了解近期健康状况、用药与生活方式依从性'}

【近14天打卡数据】
${recLines}

请直接输出随访记录正文，体现：本次随访沟通的核心内容、患者反馈、发现的问题、给出的建议。`;
    } else if (kind === 'service_record') {
      prompt = `你是健康管理服务人员，请根据以下服务要点，撰写一段完整、规范的服务记录正文（150-250字，自然语言连贯成段，不要分点编号，不要使用Markdown）。

【患者】${baseInfo}
【服务类型】${context.serviceType || context.title || '健康服务'}
【服务要点/摘要】${context.summary || '（未填写）'}

请直接输出服务记录正文。`;
    } else {
      prompt = `你是家庭医师，请把以下方案要点优化润色为一段清晰、专业、易于患者理解的健康管理方案描述（100-200字，自然语言连贯成段）。

【患者】${baseInfo}
【方案要点】${context.keypoints || context.summary || '（未填写）'}

请直接输出优化后的方案描述正文。`;
    }

    const draft = await chat([{ role: 'user', content: prompt }], { maxTokens: 800 });
    res.json({ success: true, data: { draft: (draft || '').trim() } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 场景八：AI 健康风险评估与预警（规则引擎 + AI）────────────────────
// 规则引擎：根据体检指标给出每个维度的预警信号，供 AI 综合判级
const RISK_LEVELS = ['low', 'medium', 'high', 'critical']; // 低 / 中 / 高 / 危急值
function ruleEngineSignals(lv = {}) {
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const sig = { cardiovascular: [], diabetes: [], tumor: [], kidney: [] };
  const sbp = num(lv.sbp), dbp = num(lv.dbp), fpg = num(lv.fpg), hba1c = num(lv.hba1c);
  const ldl = num(lv.ldl), tc = num(lv.tc), tg = num(lv.tg), hdl = num(lv.hdl);
  const hcy = num(lv.hcy), ua = num(lv.ua), cr = num(lv.cr || lv.scr), egfr = num(lv.egfr), bun = num(lv.bun);
  // 心血管
  if (sbp >= 180 || dbp >= 110) sig.cardiovascular.push(`血压危急 ${sbp}/${dbp} mmHg`);
  else if (sbp >= 140 || dbp >= 90) sig.cardiovascular.push(`血压偏高 ${sbp}/${dbp} mmHg`);
  if (ldl >= 4.1) sig.cardiovascular.push(`LDL-C 偏高 ${ldl} mmol/L`);
  if (tc >= 6.2) sig.cardiovascular.push(`总胆固醇偏高 ${tc} mmol/L`);
  if (tg >= 2.3) sig.cardiovascular.push(`甘油三酯偏高 ${tg} mmol/L`);
  if (hdl !== null && hdl < 1.0) sig.cardiovascular.push(`HDL-C 偏低 ${hdl} mmol/L`);
  if (hcy >= 15) sig.cardiovascular.push(`同型半胱氨酸偏高 ${hcy} μmol/L`);
  // 糖尿病
  if (fpg >= 11.1 || hba1c >= 9) sig.diabetes.push(`血糖危急（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  else if (fpg >= 7.0 || hba1c >= 6.5) sig.diabetes.push(`已达糖尿病诊断阈值（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  else if (fpg >= 6.1 || hba1c >= 5.7) sig.diabetes.push(`糖代谢受损（空腹${fpg ?? '-'}、糖化${hba1c ?? '-'}%）`);
  // 肾脏
  if (egfr !== null && egfr < 60) sig.kidney.push(`eGFR 偏低 ${egfr}`);
  if (cr !== null && cr > 104) sig.kidney.push(`肌酐偏高 ${cr} μmol/L`);
  if (bun !== null && bun > 7.1) sig.kidney.push(`尿素氮偏高 ${bun}`);
  if (ua >= 480) sig.kidney.push(`尿酸偏高 ${ua} μmol/L`);
  return sig;
}

// POST /api/staff/patients/:id/ai-risk-assessment — 生成风险评估
router.post('/patients/:id/ai-risk-assessment', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile labValues');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    const lv = user.labValues || {};
    const signals = ruleEngineSignals(lv);
    const sigText = Object.entries(signals)
      .map(([k, arr]) => `${k}：${arr.length ? arr.join('；') : '规则引擎未发现明显异常'}`)
      .join('\n');

    const labLines = [
      lv.sbp && `血压 ${lv.sbp}/${lv.dbp} mmHg`, lv.fpg && `空腹血糖 ${lv.fpg}`,
      lv.hba1c && `糖化 ${lv.hba1c}%`, lv.tc && `总胆固醇 ${lv.tc}`, lv.ldl && `LDL ${lv.ldl}`,
      lv.hdl && `HDL ${lv.hdl}`, lv.tg && `甘油三酯 ${lv.tg}`, lv.ua && `尿酸 ${lv.ua}`,
      lv.cr && `肌酐 ${lv.cr}`, lv.egfr && `eGFR ${lv.egfr}`, lv.hcy && `同型半胱氨酸 ${lv.hcy}`,
    ].filter(Boolean).join('、') || '暂无体检数据';

    const prompt = `你是一位健康风险评估专家，请基于规则引擎信号和体检数据，对以下4个维度做风险分级。

【患者】姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}；既往史：${user.healthProfile?.pastHistory || '无'}
【体检关键指标】${labLines}
【规则引擎预警信号】
${sigText}

请严格按以下JSON输出（level 取值：low/medium/high/critical，分别代表低/中/高/危急值；score 0-100）：
{
  "dimensions": [
    { "key": "cardiovascular", "label": "心血管疾病风险", "level": "low", "score": 20, "factors": ["关键风险因素"], "advice": "针对性建议（30-60字）" },
    { "key": "diabetes", "label": "糖尿病风险", "level": "low", "score": 15, "factors": [], "advice": "" },
    { "key": "tumor", "label": "肿瘤风险", "level": "low", "score": 10, "factors": [], "advice": "" },
    { "key": "kidney", "label": "慢性肾病风险", "level": "low", "score": 10, "factors": [], "advice": "" }
  ],
  "overallSummary": "整体风险综述（50-100字）"
}`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1500 });
    let raw = {};
    try { const m = text.trim().match(/\{[\s\S]*\}/); if (m) raw = JSON.parse(m[0]); } catch {}

    let dimensions = Array.isArray(raw.dimensions) ? raw.dimensions : [];
    dimensions = dimensions.map(d => ({
      key: d.key, label: d.label || d.key,
      level: RISK_LEVELS.includes(d.level) ? d.level : 'low',
      score: Number(d.score) || 0,
      factors: Array.isArray(d.factors) ? d.factors : [],
      advice: d.advice || '',
    }));
    const overallLevel = dimensions.reduce((max, d) =>
      RISK_LEVELS.indexOf(d.level) > RISK_LEVELS.indexOf(max) ? d.level : max, 'low');

    const assessment = {
      dimensions,
      overallLevel,
      overallSummary: raw.overallSummary || '',
      generatedAt: new Date(),
      approvedAt: null,
      approvedBy: null,
      // 高/危急自动标记预警（待家庭医生审核确认）
      alerted: ['high', 'critical'].includes(overallLevel),
    };

    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { aiRiskAssessment: assessment } }
    );
    res.json({ success: true, data: assessment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-risk-assessment — 家庭医生审核/修改
router.patch('/patients/:id/ai-risk-assessment', staffAuth, async (req, res) => {
  try {
    const { dimensions, overallSummary, action } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const updated = { ...(user.aiRiskAssessment || {}) };
    if (dimensions !== undefined) {
      updated.dimensions = dimensions;
      updated.overallLevel = dimensions.reduce((max, d) =>
        RISK_LEVELS.indexOf(d.level) > RISK_LEVELS.indexOf(max) ? d.level : max, 'low');
    }
    if (overallSummary !== undefined) updated.overallSummary = overallSummary;
    if (action === 'approve') {
      updated.approvedAt = new Date();
      updated.approvedBy = req.staff.name;
    }
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { aiRiskAssessment: updated } }
    );
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景九：AI 用药建议（家庭医师）────────────────────────────────────
// POST /api/staff/patients/:id/ai-medication-suggest
router.post('/patients/:id/ai-medication-suggest', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile labValues aiHealthSummary');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    // 已有用药（排除AI待审）
    const currentMeds = await Medication.find({ user: user._id, stopped: false, aiStatus: { $ne: 'pending' } })
      .select('name dosage frequency purpose').lean();
    const currentMedStr = currentMeds.length
      ? currentMeds.map(m => `${m.name} ${m.dosage} ${m.frequency}${m.purpose ? `（${m.purpose}）` : ''}`).join('；')
      : '暂无';

    const diseasesStr = (user.chronicDiseases || []).join('、') || '无';
    const labStr = user.labValues ? JSON.stringify(user.labValues).slice(0, 400) : '无';
    const allergies = user.healthProfile?.drugAllergy || '无';

    const prompt = `你是一位专业的家庭医师，请根据患者信息为其生成合理的药物调整或新增建议。

【患者】${user.name}，${user.gender || ''}，${user.age || '?'}岁
【慢病诊断】${diseasesStr}
【药物过敏】${allergies}
【当前用药】${currentMedStr}
【关键指标】${labStr}

请生成1-3条具体的药物建议（新增或调整），每条包含：化学名、剂量、用法频次、用药目的。
严格按以下JSON数组输出（仅JSON）：
[
  {
    "name": "化学名/通用名",
    "brandName": "商品名（如无可留空）",
    "dosage": "具体剂量（如10mg）",
    "method": "用法（口服/注射等）",
    "frequency": "频次（如每日1次）",
    "timing": "服药时机（如早饭后，可留空）",
    "purpose": "用药目的（30字内）"
  }
]`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1200 });
    let suggestions = [];
    try {
      const m = text.trim().match(/\[[\s\S]*\]/);
      if (m) suggestions = JSON.parse(m[0]);
    } catch {}

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ success: false, message: 'AI未能生成有效建议，请稍后重试' });
    }

    // 批量创建为待审核记录
    const created = await Medication.insertMany(suggestions.map(s => ({
      user: user._id,
      name: s.name || '未命名',
      brandName: s.brandName || '',
      dosage: s.dosage || '',
      method: s.method || '口服',
      frequency: s.frequency || '每日1次',
      timing: s.timing || '',
      purpose: s.purpose || '',
      startDate: new Date().toISOString().slice(0, 10),
      createdByStaff: true,
      staffId: req.staff._id,
      aiStatus: 'pending',
      aiGeneratedBy: req.staff.name || '',
      active: false, // 审核通过后激活
    })));

    res.json({ success: true, data: created, count: created.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/staff/patients/:id/medications/:mid/ai-review — 审核AI用药建议
router.patch('/patients/:id/medications/:mid/ai-review', staffAuth, async (req, res) => {
  try {
    const { action } = req.body; // approve | reject
    const med = await Medication.findOne({ _id: req.params.mid, user: req.params.id, aiStatus: 'pending' });
    if (!med) return res.status(404).json({ success: false, message: '未找到待审核的用药记录' });

    if (action === 'approve') {
      med.aiStatus = 'approved';
      med.active = true;
      await med.save();
      return res.json({ success: true, message: '已采纳，用药记录已激活' });
    }
    if (action === 'reject') {
      await Medication.deleteOne({ _id: med._id });
      return res.json({ success: true, message: '已拒绝并删除该建议' });
    }
    res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景十：AI 营养素建议（营养师）──────────────────────────────────────
// POST /api/staff/patients/:id/ai-supplement-suggest
router.post('/patients/:id/ai-supplement-suggest', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases lifestyle lifestyle_data labValues');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    const currentSups = await Supplement.find({ user: user._id, stopped: false, aiStatus: { $ne: 'pending' } })
      .select('name dosage frequency purpose').lean();
    const currentSupStr = currentSups.length
      ? currentSups.map(s => `${s.name} ${s.dosage} ${s.frequency}`).join('；')
      : '暂无';

    const lifestyleStr = user.lifestyle_data?.summaryOverride
      || (user.lifestyle ? `饮食：${user.lifestyle.diet || '无'}，运动：${user.lifestyle.exercise || '无'}，睡眠：${user.lifestyle.sleep || '无'}` : '无记录');

    const prompt = `你是一位专业营养师，请根据患者情况生成1-3条营养素补充建议。

【患者】${user.name}，${user.gender || ''}，${user.age || '?'}岁
【慢病标签】${(user.chronicDiseases || []).join('、') || '无'}
【生活方式概述】${lifestyleStr}
【当前营养素】${currentSupStr}

请生成具体的营养素补充建议，严格按以下JSON数组输出（仅JSON）：
[
  {
    "name": "营养素名称（如维生素D3、Omega-3、镁）",
    "brand": "品牌（可留空）",
    "dosage": "具体剂量（如1000IU、1g）",
    "method": "用法（随餐/空腹/睡前等）",
    "frequency": "频次（如每日1次）",
    "purpose": "补充目的（30字内）"
  }
]`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1000 });
    let suggestions = [];
    try {
      const m = text.trim().match(/\[[\s\S]*\]/);
      if (m) suggestions = JSON.parse(m[0]);
    } catch {}

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return res.status(400).json({ success: false, message: 'AI未能生成有效建议' });
    }

    const created = await Supplement.insertMany(suggestions.map(s => ({
      user: user._id,
      name: s.name || '未命名',
      brand: s.brand || '',
      dosage: s.dosage || '',
      method: s.method || '随餐',
      frequency: s.frequency || '每日1次',
      purpose: s.purpose || '',
      startDate: new Date().toISOString().slice(0, 10),
      createdByStaff: true,
      staffId: req.staff._id,
      aiStatus: 'pending',
      aiGeneratedBy: req.staff.name || '',
    })));

    res.json({ success: true, data: created, count: created.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/staff/patients/:id/supplements/:sid/ai-review — 审核AI营养素建议
router.patch('/patients/:id/supplements/:sid/ai-review', staffAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const sup = await Supplement.findOne({ _id: req.params.sid, user: req.params.id, aiStatus: 'pending' });
    if (!sup) return res.status(404).json({ success: false, message: '未找到待审核的营养素记录' });

    if (action === 'approve') {
      sup.aiStatus = 'approved';
      await sup.save();
      return res.json({ success: true, message: '已采纳营养素建议' });
    }
    if (action === 'reject') {
      await Supplement.deleteOne({ _id: sup._id });
      return res.json({ success: true, message: '已拒绝并删除该建议' });
    }
    res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景十五：AI 转介草稿（家庭医师/任意角色）────────────────────────────
// POST /api/staff/patients/:id/ai-referral-draft
router.post('/patients/:id/ai-referral-draft', staffAuth, async (req, res) => {
  try {
    const { toRole, toName } = req.body; // 接收方角色/姓名（可选，用于定向措辞）
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile labValues aiHealthSummary lifestyle_data');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    const meds = await Medication.find({ user: user._id, stopped: false, aiStatus: { $ne: 'pending' } })
      .select('name dosage').limit(5).lean();

    const prompt = `你是一位家庭医师，请为以下患者撰写一份简洁的科室转介说明（不超过120字），包含：主要病情、转介原因、需要对方协助的具体内容。语气专业，条理清晰。

【患者】${user.name}，${user.gender || ''}，${user.age || '?'}岁
【主要诊断/慢病】${(user.chronicDiseases || []).join('、') || '无'}
【当前主要用药】${meds.length ? meds.map(m => `${m.name} ${m.dosage}`).join('；') : '无'}
【药物过敏】${user.healthProfile?.drugAllergy || '无'}
${toRole ? `【转介目标】${toRole}${toName ? `（${toName}）` : ''}` : ''}

请分两行输出：
转介原因：（一句话，20字内）
详细说明：（具体内容，80字内）`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 400 });
    const reasonMatch = text.match(/转介原因[：:]\s*(.+)/);
    const contentMatch = text.match(/详细说明[：:]\s*([\s\S]+)/);
    res.json({
      success: true,
      data: {
        reason: reasonMatch ? reasonMatch[1].trim() : '',
        content: contentMatch ? contentMatch[1].trim().slice(0, 300) : text.trim().slice(0, 300),
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景六：AI 智能随访建议（随访时机判断 + 随访提纲）────────────────
// POST /api/staff/patients/:id/ai-followup-suggestion
router.post('/patients/:id/ai-followup-suggestion', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name gender age chronicDiseases labValues');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    // 近30天打卡数据
    const since = new Date(Date.now() - 30 * 86400000);
    const records = await HealthRecord.find({ user: user._id, recordedAt: { $gte: since } })
      .sort({ recordedAt: -1 }).limit(60).lean();
    const recLines = records.length
      ? records.slice(0, 40).map(r => `${String(r.recordedAt).slice(0, 10)} ${r.label}：${r.value}${r.unit || ''}${r.status && r.status !== 'normal' ? '（异常）' : ''}`).join('\n')
      : '近30天无打卡数据';
    // 最近一次随访
    const lastFu = await FollowUp.findOne({ patientId: user._id }).sort({ date: -1 }).lean();
    const lastFuText = lastFu ? `${String(lastFu.date).slice(0, 10)}（${lastFu.theme || '常规'}）` : '无记录';
    const nextPlanned = await FollowUp.findOne({ patientId: user._id, status: 'planned', date: { $gte: new Date() } }).sort({ date: 1 }).lean();
    const nextPlannedText = nextPlanned ? String(nextPlanned.date).slice(0, 10) : '未排期';

    const prompt = `你是慢病管理随访专员，请根据患者近期数据判断随访时机并生成随访提纲。

【患者】姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}
【上次随访】${lastFuText}
【已排期下次随访】${nextPlannedText}
【近30天打卡数据】
${recLines}

【今天日期】${new Date().toISOString().slice(0, 10)}（suggestedDate 必须晚于今天）
判断规则参考：指标稳定→按原计划(keep)；指标异常/恶化→建议提前(advance)；指标改善且稳定→可延长间隔(extend)。
请严格按以下JSON输出（仅JSON）：
{
  "timing": "keep",
  "timingReason": "判断理由（30-60字）",
  "suggestedDate": "YYYY-MM-DD",
  "theme": "建议随访主题",
  "outline": ["随访提纲要点1", "要点2", "要点3"]
}`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1000 });
    let raw = {};
    try { const m = text.trim().match(/\{[\s\S]*\}/); if (m) raw = JSON.parse(m[0]); } catch {}
    const VALID_TIMING = ['advance', 'keep', 'extend'];
    const suggestion = {
      timing: VALID_TIMING.includes(raw.timing) ? raw.timing : 'keep',
      timingReason: raw.timingReason || '',
      suggestedDate: raw.suggestedDate || '',
      theme: raw.theme || '常规随访',
      outline: Array.isArray(raw.outline) ? raw.outline : [],
      generatedAt: new Date(),
      generatedBy: req.staff.name || '',
      status: 'pending',
    };
    await User.collection.updateOne({ _id: user._id }, { $set: { aiFollowupDraft: suggestion } });
    res.json({ success: true, data: suggestion });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-followup-draft — 审核AI随访建议草稿（健管专员）
router.patch('/patients/:id/ai-followup-draft', staffAuth, async (req, res) => {
  try {
    const { action, notes } = req.body; // action: approve | reject
    const user = await User.findById(req.params.id).select('_id name aiFollowupDraft');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const draft = user.aiFollowupDraft;
    if (!draft || draft.status !== 'pending') return res.status(400).json({ success: false, message: '暂无待审核的随访建议草稿' });

    if (action === 'reject') {
      await User.collection.updateOne({ _id: user._id }, { $set: { aiFollowupDraft: null } });
      return res.json({ success: true, message: '已拒绝该随访建议' });
    }

    if (action === 'approve') {
      // 创建随访计划
      const fu = await FollowUp.create({
        patientId: user._id,
        staffId: req.staff._id,
        date: draft.suggestedDate ? new Date(draft.suggestedDate) : new Date(),
        theme: draft.theme || '常规随访',
        status: 'planned',
        aiGenerated: true,
        notes: [
          draft.timingReason ? `时机判断：${draft.timingReason}` : '',
          Array.isArray(draft.outline) && draft.outline.length ? `随访要点：${draft.outline.join('；')}` : '',
          notes ? `审核备注：${notes}` : '',
        ].filter(Boolean).join('\n'),
      });
      await User.collection.updateOne({ _id: user._id }, { $set: {
        aiFollowupDraft: { ...draft, status: 'approved', approvedAt: new Date(), approvedBy: req.staff.name },
      }});
      return res.json({ success: true, message: '已采纳，随访计划已创建', followUpId: fu._id });
    }

    res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景九：AI 健康教练消息（依从性评估 + 鼓励/提醒消息）──────────────
// POST /api/staff/patients/:id/ai-coach-message
router.post('/patients/:id/ai-coach-message', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name gender age chronicDiseases');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    // 近14天打卡，按自然日去重计算连续打卡天数
    const since = new Date(Date.now() - 14 * 86400000);
    const records = await HealthRecord.find({ user: user._id, recordedAt: { $gte: since } })
      .sort({ recordedAt: -1 }).select('recordedAt label').lean();
    const dayset = new Set(records.map(r => String(r.recordedAt).slice(0, 10)));
    // 计算从今天往前的连续打卡天数
    let streak = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      if (dayset.has(d)) streak++;
      else if (i > 0) break; // 今天未打卡不中断（允许当天还没打），昨天起断则停
      else continue;
    }
    const daysSinceLast = records.length
      ? Math.floor((Date.now() - new Date(records[0].recordedAt)) / 86400000)
      : 999;
    // 依从性等级
    let adherence, tone;
    if (daysSinceLast >= 3) { adherence = 'low'; tone = '提醒'; }
    else if (streak >= 7) { adherence = 'high'; tone = '鼓励'; }
    else if (streak >= 3) { adherence = 'medium'; tone = '鼓励'; }
    else { adherence = 'low'; tone = '提醒'; }

    const prompt = `你是一位温暖、专业的健康教练，请给会员发一条${tone}消息（40-80字，口语化、有温度、不说教，可用1个emoji，不要分点）。

【会员】${user.name}，慢病标签：${user.chronicDiseases?.join('、') || '无'}
【打卡情况】连续打卡 ${streak} 天，距上次打卡 ${daysSinceLast >= 999 ? '很久' : daysSinceLast + ' 天'}
【消息类型】${tone}（依从性${adherence === 'high' ? '良好' : adherence === 'medium' ? '一般' : '偏低'}）

请直接输出消息正文。`;

    const message = await chat([{ role: 'user', content: prompt }], { maxTokens: 300 });
    const coachDraft = {
      message: (message || '').trim(),
      adherence, streak,
      daysSinceLast: daysSinceLast >= 999 ? null : daysSinceLast,
      tone,
      generatedAt: new Date(),
      generatedBy: req.staff.name || '',
      status: 'pending',
    };
    await User.collection.updateOne({ _id: user._id }, { $set: { aiCoachDraft: coachDraft } });
    res.json({ success: true, data: coachDraft });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-coach-draft — 审核AI教练消息草稿（营养师）
router.patch('/patients/:id/ai-coach-draft', staffAuth, async (req, res) => {
  try {
    const { action, message: editedMessage } = req.body; // action: approve | reject
    const user = await User.findById(req.params.id).select('_id name aiCoachDraft');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const draft = user.aiCoachDraft;
    if (!draft || draft.status !== 'pending') return res.status(400).json({ success: false, message: '暂无待审核的教练消息草稿' });

    if (action === 'reject') {
      await User.collection.updateOne({ _id: user._id }, { $set: { aiCoachDraft: null } });
      return res.json({ success: true, message: '已拒绝该教练消息' });
    }

    if (action === 'approve') {
      const finalMsg = (editedMessage || draft.message || '').trim();
      if (!finalMsg) return res.status(400).json({ success: false, message: '消息内容不能为空' });
      await PushRecord.create({
        staffId: req.staff._id, patientId: user._id,
        type: 'notice', title: '健康教练', content: finalMsg,
      });
      await User.collection.updateOne({ _id: user._id }, { $set: {
        aiCoachDraft: { ...draft, status: 'approved', approvedAt: new Date(), approvedBy: req.staff.name },
      }});
      return res.json({ success: true, message: '消息已发送给会员' });
    }

    res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/coach-message/send — 发送健康教练消息（审核后）
router.post('/patients/:id/coach-message/send', staffAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ success: false, message: '消息内容不能为空' });
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    await PushRecord.create({
      staffId: req.staff._id, patientId: user._id,
      type: 'notice', title: '健康教练', content: message.trim(),
    });
    res.json({ success: true, message: '已发送给会员' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景五：AI 个性化内容推荐（画像匹配知识库 + 推荐理由）──────────────
// POST /api/staff/patients/:id/ai-content-recommend
router.post('/patients/:id/ai-content-recommend', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name gender age chronicDiseases aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');
    // 候选知识库（公开 + 较新），最多40条供AI筛选
    const candidates = await KnowledgeItem.find({ isPublic: true })
      .sort({ createdAt: -1 }).limit(40).select('title category tags content').lean();
    if (!candidates.length) {
      return res.json({ success: true, data: { items: [], note: '知识库暂无内容，请先在知识库录入科普内容' } });
    }

    // 已推送过的知识（避免重复）
    const pushed = await PushRecord.find({ patientId: user._id, type: 'knowledge' }).select('knowledgeId').lean();
    const pushedSet = new Set(pushed.map(p => String(p.knowledgeId)));

    const riskFactors = (user.aiRiskAssessment?.dimensions || [])
      .filter(d => ['high', 'medium', 'critical'].includes(d.level))
      .map(d => `${d.label}(${d.level})`).join('、') || '无';

    const candText = candidates.map((c, i) =>
      `${i + 1}. [${c.category}] ${c.title}｜标签：${(c.tags || []).join('/') || '无'}${pushedSet.has(String(c._id)) ? '（已推送过）' : ''}`
    ).join('\n');

    const prompt = `你是健康内容运营，请根据会员画像，从候选知识库中挑选最适合推送的3-5条内容，做到"千人千面"，避免推送已推送过的内容。

【会员画像】姓名：${user.name}，性别：${user.gender || '未知'}，年龄：${user.age || '未知'}岁；慢病标签：${user.chronicDiseases?.join('、') || '无'}；风险维度：${riskFactors}

【候选内容】
${candText}

请严格按以下JSON输出（index 为候选内容编号；仅JSON）：
{ "items": [ { "index": 1, "reason": "推荐理由（20-40字，结合会员画像）" } ] }`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 800 });
    let raw = {};
    try { const m = text.trim().match(/\{[\s\S]*\}/); if (m) raw = JSON.parse(m[0]); } catch {}
    const picks = Array.isArray(raw.items) ? raw.items : [];
    const items = picks.map(p => {
      const c = candidates[Number(p.index) - 1];
      if (!c) return null;
      return {
        knowledgeId: String(c._id),
        title: c.title,
        category: c.category,
        reason: p.reason || '',
        alreadyPushed: pushedSet.has(String(c._id)),
      };
    }).filter(Boolean);

    res.json({ success: true, data: { items } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 4.3 专项筛查：录入筛查结果（支持图片/PDF上传） ────────────────
// POST /api/staff/patients/:id/screening-records
router.post('/patients/:id/screening-records', staffAuth, uploadScreening.array('files', 10), async (req, res) => {
  try {
    const { title, screeningCategory, checkDate, hospital, note,
            screeningL1, screeningL2, screeningL3, examDescription, examConclusion } = req.body;
    const raw = req.body.reportItems;
    const reportItems = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : []);
    const rawL3Items = req.body.screeningL3Items;
    const screeningL3Items = Array.isArray(rawL3Items) ? rawL3Items : (rawL3Items ? JSON.parse(rawL3Items) : []);
    const resolvedTitle = title || screeningL2 || screeningL3 || '';
    if (!resolvedTitle) {
      return res.status(400).json({ success: false, message: '请选择筛查分类' });
    }
    const uploadedFiles = req.files || [];
    const fileUrls = uploadedFiles.map(f => `/api/uploads/screening/${f.filename}`);
    const fileUrl  = fileUrls[0] || '';
    const mimeType = uploadedFiles[0] ? uploadedFiles[0].mimetype : '';
    // 前端已明确传 reportItems，直接使用（不再从 screeningL3Items 兜底）
    const finalReportItems = reportItems;
    // screeningCategory/type 只接受固定 enum，L1 ObjectId 不合法，统一存 'other'
    const VALID_CATEGORIES = ['tumor','cardiovascular','brain_vessel','chronic','functional','other_routine','health_promote','infectious','hormone',''];
    const VALID_TYPES = ['annual','body_comp','blood','bloodTest','ultrasound','radiology','mri','endoscopy','ecg','pathology','functional','genetic','other','followup','imaging','tumor','cardiovascular','chronic','health_promote'];
    const safeCategory = VALID_CATEGORIES.includes(screeningCategory) ? screeningCategory : '';
    const safeType     = VALID_TYPES.includes(screeningCategory)     ? screeningCategory : 'other';
    // 查重：同一患者、同一检查日期、同一 screeningL1，更新已有记录而非新建
    let report;
    const existing = checkDate && screeningL1
      ? await MedicalReport.findOne({ user: req.params.id, checkDate, screeningL1 })
      : null;
    if (existing) {
      if (finalReportItems.length) existing.reportItems = finalReportItems;
      if (screeningL2)        existing.screeningL2       = screeningL2;
      if (screeningL3)        existing.screeningL3       = screeningL3;
      if (screeningL3Items.length) existing.screeningL3Items = screeningL3Items;
      if (examDescription)    existing.examDescription   = examDescription;
      if (examConclusion)     existing.examConclusion    = examConclusion;
      if (hospital)           existing.hospital          = hospital;
      if (note)               existing.note              = note;
      if (fileUrl)            { existing.fileUrl = fileUrl; existing.fileUrls = fileUrls; existing.mimeType = mimeType; }
      report = await existing.save();
    } else {
      report = await MedicalReport.create({
        user:             req.params.id,
        title:            resolvedTitle,
        type:             safeType,
        screeningCategory: safeCategory,
        screeningL1:      screeningL1 || '',
        screeningL2:      screeningL2 || '',
        screeningL3:      screeningL3 || '',
        screeningL3Items,
        examDescription:  examDescription || '',
        examConclusion:   examConclusion  || '',
        checkDate:        checkDate || '',
        hospital:         hospital  || '',
        reportItems:      finalReportItems,
        note:             note || '',
        fileUrl,
        fileUrls,
        mimeType,
        audit_status:     'unaudited',
        uploadedBy:       req.staff._id,
      });
    }

    // 医护手动录入也同步写入 UserScreeningItem，跟AI自动归类共用同一份"当前状态"索引，
    // 避免手动录入和AI识别各存一份、专项筛查视图里出现重复/对不上账
    if (screeningL1 && screeningL2 && screeningL3Items.length) {
      for (const name of screeningL3Items) {
        const key = `${screeningL1}|${screeningL2}|${name}`;
        await upsertScreeningKey(req.params.id, report._id, key, name);
      }
    }

    res.json({ success: true, data: report });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/screening-records/:rid
router.delete('/patients/:id/screening-records/:rid', staffAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findOneAndDelete({ _id: req.params.rid, user: req.params.id });
    if (!report) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, message: '已删除' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PATCH /api/staff/patients/:id/screening-records/:rid
router.patch('/patients/:id/screening-records/:rid', staffAuth, uploadScreening.array('files', 10), async (req, res) => {
  try {
    const { title, checkDate, hospital, note, screeningL1, screeningL2, screeningL3, examDescription, examConclusion } = req.body;
    const raw = req.body.reportItems;
    const reportItems = Array.isArray(raw) ? raw : (raw ? JSON.parse(raw) : undefined);
    const rawL3Items = req.body.screeningL3Items;
    const screeningL3Items = Array.isArray(rawL3Items) ? rawL3Items : (rawL3Items ? JSON.parse(rawL3Items) : undefined);
    const update = {};
    if (title)            update.title = title;
    if (checkDate !== undefined) update.checkDate = checkDate;
    if (hospital !== undefined)  update.hospital = hospital;
    if (note !== undefined)      update.note = note;
    if (screeningL1)      update.screeningL1 = screeningL1;
    if (screeningL2)      update.screeningL2 = screeningL2;
    if (screeningL3 !== undefined) update.screeningL3 = screeningL3;
    if (examDescription !== undefined) update.examDescription = examDescription;
    if (examConclusion !== undefined)  update.examConclusion = examConclusion;
    if (reportItems)      update.reportItems = reportItems;
    if (screeningL3Items) update.screeningL3Items = screeningL3Items;
    if (req.files && req.files.length > 0) {
      const newUrls = req.files.map(f => `/api/uploads/screening/${f.filename}`);
      // 追加到已有文件列表
      const existing = await MedicalReport.findById(req.params.rid).select('fileUrls fileUrl');
      const existingUrls = existing?.fileUrls?.length ? existing.fileUrls : (existing?.fileUrl ? [existing.fileUrl] : []);
      update.fileUrls = [...existingUrls, ...newUrls];
      update.fileUrl  = update.fileUrls[0];
      update.mimeType = req.files[0].mimetype;
    }
    const report = await MedicalReport.findOneAndUpdate({ _id: req.params.rid, user: req.params.id }, { $set: update }, { new: true });
    if (!report) return res.status(404).json({ success: false, message: '记录不存在' });

    // 同 POST：编辑手动录入的筛查记录也要重新同步 UserScreeningItem
    const syncL1 = report.screeningL1, syncL2 = report.screeningL2, syncL3Items = report.screeningL3Items || [];
    if (syncL1 && syncL2 && syncL3Items.length) {
      for (const name of syncL3Items) {
        const key = `${syncL1}|${syncL2}|${name}`;
        await upsertScreeningKey(req.params.id, report._id, key, name);
      }
    }

    res.json({ success: true, data: report });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.3 专项筛查结果：按筛查分类查询报告 ─────────────────────────
// GET /api/staff/patients/:id/screening-reports
router.get('/patients/:id/screening-reports', staffAuth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({
      user: req.params.id,
      $or: [
        { screeningCategory: { $exists: true, $ne: '' } },
        { screeningL1: { $exists: true, $ne: '' } },
      ],
    }).sort({ checkDate: -1, createdAt: -1 }).lean();
    res.json({ success: true, data: reports });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/staff/screening-tree — 专项筛查三层结构（从管理端套餐动态读取）
router.get('/screening-tree', staffAuth, async (req, res) => {
  try {
    const [cats, pkgs, directFuncTests] = await Promise.all([
      ProjectCategory.find({ status: 'active' }).lean(),
      LabTestPackage.find({ status: 'active' })
        .populate({ path: 'orders', select: 'name items', populate: { path: 'items', select: 'name unit referenceRange referenceValue' } })
        .populate('labTestItems', 'name unit referenceRange referenceValue')
        .populate({ path: 'specialExams', match: { deleted: { $ne: true } }, select: 'name description conclusion' })
        .populate('functionalTests', 'name')
        .lean(),
      FunctionalMedicineTest.find({ status: 'active', deleted: { $ne: true }, categoryId: { $ne: null } }).select('name categoryId').lean(),
    ]);
    const l1s = cats.filter(c => !c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const l2sByParent = {};
    cats.filter(c => c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(c => {
      const pid = String(c.parent);
      if (!l2sByParent[pid]) l2sByParent[pid] = [];
      l2sByParent[pid].push(c);
    });
    const pkgByCat = {};
    pkgs.forEach(p => {
      if (!p.categoryId) return;
      const cid = String(p.categoryId);
      if (!pkgByCat[cid]) pkgByCat[cid] = [];
      pkgByCat[cid].push(p);
    });
    const tree = l1s.map(l1 => {
      const l1id = String(l1._id);
      const children = (l2sByParent[l1id] || []).map(l2 => {
        const l2id = String(l2._id);
        const matchPkgs = pkgByCat[l2id] || [];
        // 三类分项，按类型分别汇总（去重）
        const labOrderMap = new Map();   // name -> { name, subItems }
        const examMap = new Map();       // name -> { name, description, conclusion }
        const funcSet = new Set();       // name
        matchPkgs.forEach(p => {
          (p.orders || []).forEach(o => {
            if (o && o.name && !labOrderMap.has(o.name)) {
              const subItems = (o.items || []).filter(i => i && i.name).map(i => ({
                name: i.name,
                unit: i.unit || '',
                referenceRange: i.referenceRange || i.referenceValue || '',
              }));
              labOrderMap.set(o.name, { name: o.name, subItems });
            }
          });
          (p.labTestItems || []).forEach(i => {
            if (i && i.name && !labOrderMap.has(i.name)) {
              labOrderMap.set(i.name, { name: i.name, subItems: [] });
            }
          });
          (p.specialExams || []).forEach(e => {
            if (e && e.name) examMap.set(e.name, { name: e.name, description: e.description || '', conclusion: e.conclusion || '' });
          });
          (p.functionalTests || []).forEach(f => f && f.name && funcSet.add(f.name));
        });
        // 直接绑定了该 L2 分类的功能医学检测项目
        directFuncTests.filter(f => f.categoryId && String(f.categoryId) === l2id).forEach(f => funcSet.add(f.name));
        // 跨类去重：examItems 里已有的名字，从 labOrders 中排除
        const examNames = new Set(examMap.keys());
        const labOrders = [...labOrderMap.values()].filter(o => !examNames.has(o.name));
        return {
          _id: l2._id,
          label: l2.name,
          labOrders,
          examItems: [...examMap.values()],
          funcItems: [...funcSet],
          items: [...labOrders.map(o => o.name), ...examMap.keys(), ...funcSet],
          packageIds: matchPkgs.map(p => p._id),
        };
      });
      return { _id: l1._id, label: l1.name, children };
    });
    res.json({ success: true, data: tree });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AI 待办任务聚合接口 ────────────────────────────────────────────
// 汇总所有 AI 生成内容中待人工审核的任务，按紧急程度排序
// 各 AI 审核场景 → 负责审核的角色（对齐《AI场景完整需求文档·含权限修正》）
// 家庭医师：AI汇总5维 / 年度方案 / 药物 / 转介 / 风险评估
// 营养师：  生活方式评估 / 营养干预 / 营养素 / 教练消息
// 健管专员：健康档案问卷 / 体检报告OCR / 检查开单 / 随访建议
// 就医专员：就医协助记录
const TODO_REVIEW_ROLE = {
  report_review:        'healthManager',
  archive_review:       'healthManager',
  followup_review:      'healthManager',
  checkup_plan_review:  'healthManager',
  summary_review:       'familyDoctor',
  risk_review:          'familyDoctor',
  medication_review:    'familyDoctor',
  lifestyle_review:     'nutritionist',
  coach_review:         'nutritionist',
  supplement_review:    'nutritionist',
  nutrition_plan_review:'nutritionist',
};

router.get('/ai-todos', staffAuth, async (req, res) => {
  try {
    const role = req.staff.role;
    const isSuper = role === 'superadmin';
    // 当前角色能审核哪些场景类型；超管看全部
    const allowedTypes = isSuper
      ? Object.keys(TODO_REVIEW_ROLE)
      : Object.keys(TODO_REVIEW_ROLE).filter(t => TODO_REVIEW_ROLE[t] === role);
    const can = (type) => allowedTypes.includes(type);

    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const todos = [];

    // ── 健管专员：体检报告 OCR 待审核（aiStatus=pending）──
    if (can('report_review')) {
      const pendingReports = await MedicalReport.find({ aiStatus: 'pending' })
        .populate('user', 'name phone').sort({ updatedAt: -1 }).limit(50).lean();
      pendingReports.forEach(r => {
        const createdAt = r.updatedAt || r.createdAt;
        todos.push({
          id: 'report_' + r._id, type: 'report_review', label: '体检报告待审核', priority: 2,
          patientName: r.user?.name || '未知', patientId: String(r.user?._id || ''),
          summary: r.aiSummary ? r.aiSummary.slice(0, 60) : `${r.title} · AI解析完成`,
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${r.user?._id}?tab=reports&reportId=${r._id}`,
        });
      });
    }

    // ── 健管专员：健康档案问卷 AI 识别草稿待审核（archiveDraft 非空）──
    if (can('archive_review')) {
      const draftUsers = await User.find({ archiveDraft: { $ne: null } })
        .select('name archiveDraft updatedAt').limit(50).lean();
      draftUsers.forEach(u => {
        const d = u.archiveDraft || {};
        const cnt = Array.isArray(d.items) ? d.items.length : (d.fields ? Object.keys(d.fields).length : 0);
        const createdAt = d.generatedAt || u.updatedAt || now;
        todos.push({
          id: 'archive_' + u._id, type: 'archive_review', label: '健康档案问卷待审核', priority: 3,
          patientName: u.name || '未知', patientId: String(u._id),
          summary: cnt ? `AI识别 ${cnt} 项档案字段待审核` : 'AI已识别问卷，待审核写入档案',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${u._id}?tab=archive`,
        });
      });
    }

    // ── 家庭医师 / 营养师：AI 汇总分析按维度拆分审核 ──
    if (can('summary_review') || can('lifestyle_review')) {
      const sumUsers = await User.find({ aiHealthSummary: { $ne: null } })
        .select('name aiHealthSummary').limit(100).lean();
      sumUsers.forEach(u => {
        const root = u.aiHealthSummary || {};
        // 兼容旧数据（无 byYear）
        let byYear = root.byYear || {};
        if (Object.keys(byYear).length === 0 && root.sections) {
          const oy = String(root.generatedAt ? new Date(root.generatedAt).getFullYear() : 2026);
          byYear = { [oy]: { sections: root.sections, generatedAt: root.generatedAt, approvedAt: root.approvedAt } };
        }
        // 取最近一个已生成年度
        const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
        const y = years[0];
        if (!y) return;
        const e = byYear[y] || {};
        if (!e.sections) return;
        const createdAt = e.generatedAt || now;
        const overdue = (now - new Date(createdAt)) > DAY;
        // 家庭医师审 5 维（整体未通过 && 医师维度未通过）
        if (can('summary_review') && !e.approvedAt && !e.doctorApprovedAt) {
          todos.push({
            id: 'summary_' + u._id, type: 'summary_review', label: 'AI汇总分析待审核（5维度）', priority: 2,
            patientName: u.name || '未知', patientId: String(u._id),
            summary: `${y}年度 · 肿瘤/心脑血管/慢病/体检全面性/优先医疗问题`,
            createdAt, overdue, link: `/patients/${u._id}?tab=ai&aiYear=${y}`,
          });
        }
        // 营养师审「生活方式评估」单维度
        const hasLifestyle = !!e.sections.lifestyle_assessment &&
          ((e.sections.lifestyle_assessment.items || []).length > 0 || e.sections.lifestyle_assessment.summary);
        if (can('lifestyle_review') && hasLifestyle && !e.approvedAt && !e.nutritionApprovedAt) {
          todos.push({
            id: 'lifestyle_' + u._id, type: 'lifestyle_review', label: '生活方式评估待审核', priority: 3,
            patientName: u.name || '未知', patientId: String(u._id),
            summary: `${y}年度 · AI汇总分析「生活方式评估」维度`,
            createdAt, overdue, link: `/patients/${u._id}?tab=ai&aiYear=${y}`,
          });
        }
      });
    }

    // ── 家庭医师：AI用药建议待审核 ──
    if (can('medication_review')) {
      const pendingMeds = await Medication.find({ aiStatus: 'pending' })
        .populate('user', 'name').sort({ createdAt: -1 }).limit(50).lean();
      pendingMeds.forEach(m => {
        const createdAt = m.createdAt || new Date();
        todos.push({
          id: 'medication_' + m._id, type: 'medication_review', label: 'AI用药建议待审核', priority: 2,
          patientName: m.user?.name || '未知', patientId: String(m.user?._id || ''),
          summary: `${m.name} ${m.dosage} ${m.frequency}${m.purpose ? ' · ' + m.purpose : ''}`,
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${m.user?._id}?tab=medications`,
        });
      });
    }

    // ── 营养师：AI营养素建议待审核 ──
    if (can('supplement_review')) {
      const pendingSups = await Supplement.find({ aiStatus: 'pending' })
        .populate('user', 'name').sort({ createdAt: -1 }).limit(50).lean();
      pendingSups.forEach(s => {
        const createdAt = s.createdAt || new Date();
        todos.push({
          id: 'supplement_' + s._id, type: 'supplement_review', label: 'AI营养素建议待审核', priority: 3,
          patientName: s.user?.name || '未知', patientId: String(s.user?._id || ''),
          summary: `${s.name} ${s.dosage} ${s.frequency}${s.purpose ? ' · ' + s.purpose : ''}`,
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${s.user?._id}?tab=medications`,
        });
      });
    }

    // ── 健管专员：AI随访建议草稿待审核 ──
    if (can('followup_review')) {
      const fuDraftUsers = await User.find({ 'aiFollowupDraft.status': 'pending' })
        .select('name aiFollowupDraft').limit(50).lean();
      fuDraftUsers.forEach(u => {
        const d = u.aiFollowupDraft || {};
        const createdAt = d.generatedAt || new Date();
        todos.push({
          id: 'followup_' + u._id, type: 'followup_review', label: 'AI随访建议待审核', priority: 3,
          patientName: u.name || '未知', patientId: String(u._id),
          summary: d.theme ? `建议主题：${d.theme}${d.suggestedDate ? ' · ' + d.suggestedDate : ''}` : 'AI生成随访提纲，待健管专员审核采纳',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${u._id}?tab=followups`,
        });
      });
    }

    // ── 营养师：AI教练消息草稿待审核 ──
    if (can('coach_review')) {
      const coachDraftUsers = await User.find({ 'aiCoachDraft.status': 'pending' })
        .select('name aiCoachDraft').limit(50).lean();
      coachDraftUsers.forEach(u => {
        const d = u.aiCoachDraft || {};
        const createdAt = d.generatedAt || new Date();
        todos.push({
          id: 'coach_' + u._id, type: 'coach_review', label: 'AI教练消息待审核', priority: 3,
          patientName: u.name || '未知', patientId: String(u._id),
          summary: d.message ? d.message.slice(0, 50) : 'AI生成教练消息，待营养师审核发送',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${u._id}?tab=followups`,
        });
      });
    }

    // ── 营养师：AI营养干预方案待审核 ──
    if (can('nutrition_plan_review')) {
      const nutritionPlans = await HealthPlan.find({ type: 'nutrition', 'content.aiStatus': 'pending' })
        .populate('patientId', 'name').sort({ createdAt: -1 }).limit(50).lean();
      nutritionPlans.forEach(p => {
        const createdAt = p.createdAt || new Date();
        todos.push({
          id: 'nutrition_plan_' + p._id, type: 'nutrition_plan_review', label: 'AI营养方案待审核', priority: 3,
          patientName: p.patientId?.name || '未知', patientId: String(p.patientId?._id || ''),
          summary: 'AI生成营养干预方案，待营养师审核',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/plans/${p._id}`,
        });
      });
    }

    // ── 健管专员：AI年度体检方案待审核 ──
    if (can('checkup_plan_review')) {
      const checkupPlans = await HealthPlan.find({ type: 'annual_checkup', 'content.aiStatus': 'pending' })
        .populate('patientId', 'name').sort({ createdAt: -1 }).limit(50).lean();
      checkupPlans.forEach(p => {
        const createdAt = p.createdAt || new Date();
        todos.push({
          id: 'checkup_plan_' + p._id, type: 'checkup_plan_review', label: 'AI体检方案待审核', priority: 3,
          patientName: p.patientId?.name || '未知', patientId: String(p.patientId?._id || ''),
          summary: 'AI生成年度体检方案，待健管专员审核',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/plans/${p._id}`,
        });
      });
    }

    // ── 家庭医师：风险预警待处理 → User.aiRiskAssessment 高/危急 且未审核 ──
    if (can('risk_review')) {
      const riskUsers = await User.find({
        'aiRiskAssessment.alerted': true,
        'aiRiskAssessment.approvedAt': null,
      }).select('name aiRiskAssessment').limit(50).lean();
      riskUsers.forEach(u => {
        const ra = u.aiRiskAssessment || {};
        const createdAt = ra.generatedAt || now;
        const critical = ra.overallLevel === 'critical';
        todos.push({
          id: 'risk_' + u._id, type: 'risk_review',
          label: critical ? '风险预警·危急值' : '风险预警·高风险', priority: 1,
          patientName: u.name || '未知', patientId: String(u._id),
          summary: (ra.overallSummary || '').slice(0, 60) || 'AI检测到高风险，请家庭医师审核',
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${u._id}?tab=ai-risk`,
        });
      });
    }

    // 按优先级排序：priority越小越紧急，同级按时间倒序；超时优先
    todos.sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue ? 1 : -1;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json({ success: true, data: todos, total: todos.length, role });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const REPORT_PARSE_PROMPT = `你是体检报告结构化提取助手。请分析这张体检报告图片，按以下规则提取数据。

【基本规则】
规则零：只提取本图中实际存在的内容，绝对不推断、联想或补全。
规则A：跳过患者基本信息页——姓名、性别、年龄、出生日期、身份证号、手机号/电话、单位/工作单位、体检日期、体检编号/报告编号，一律不提取。
规则B：跳过汇总页——页面包含"异常结果汇总""体检结果汇总""异常结果及建议"或以"尊敬的XX先生/女士"开头的综合小结页，整页跳过不提取。
规则C：跳过目录页、项目清单页（只有项目名称没有结果的页面）。
规则D：name 字段必须干净，去除【】[]《》等括号符号和序号前缀，例：✗"内科】" → ✓"内科"。
规则E：相似项目名称不可混淆，如"碳13"≠"碳14"，"空腹血糖"≠"餐后血糖"。
规则F：检验数值必须与其对应项目严格匹配，不可串行填写。
规则G：findings/diagnosis/conclusion 字段只填报告原文，不加解释或分析。

【提取规则（按检查类型）】

1. 一般检查（身高/体重/BMI/脉搏）
   → itemType="data"，每项单独一条
   → name=项目名，value=数值，unit=单位，referenceRange=参考范围
   → conclusion=该项小结原文（如有）

2. 血压
   → itemType="data"，name="血压"
   → value=血压值（如"120/80"），unit="mmHg"
   → conclusion=小结原文（如有）

3. 内外科 / 耳鼻喉 / 视力检查 / 眼压检查 / 眼科检查
   → 体格检查项目，非检验项目，itemType="imaging"，每个科目单独一条
   → findings=检查所见/结果原文（完整，不罗列细项）
   → diagnosis=诊断意见/小结原文
   → conclusion=同 diagnosis

4. 裂隙灯检查 / 双眼眼底照相
   → itemType="imaging"，每项单独一条
   → findings=检查所见，diagnosis=诊断意见，conclusion=同 diagnosis

5. 所有血液检查（肝肾功能/血糖/血脂/肿瘤标志物/尿微量白蛋白/尿肌酐/抗核抗体谱等免疫指标）
   → itemType="lab"，每个子项单独一条，禁止合并为一条、禁止漏项；即使多个子项结果完全相同（如都是"阴性"），也必须逐项列出，不能合并成一条摘要
   → name/value/unit/referenceRange/status 逐项填写
   → orderName=所属检验单名称（如"肝功能""肾功能""血脂全套""抗核抗体谱"；同一化验单标题无论写"肾功能""肾功能四项""肾功能+尿酸"，一律 orderName="肾功能"）

6. 尿常规 / 粪便常规
   → itemType="imaging"，整体一条，不罗列单项
   → findings=完整检查结果原文，diagnosis=结论/小结

7. 碳13 / 碳14 呼气试验
   → itemType="imaging"
   → findings=检查结果，diagnosis=结论，conclusion=同 diagnosis

8. 超声（肝脏/胆胰脾/双肾输尿管膀胱/前列腺/甲状腺/颈动脉/心脏超声/乳腺/子宫附件或阴道等）
   → 【核心规则】常见器官固定为：肝脏、胆胰脾（胆囊/胰腺/脾脏，常与肝脏同页/同单，但仍需按器官拆开）、甲状腺、乳腺、子宫附件或阴道、双肾输尿管膀胱、前列腺、颈动脉、心脏超声。
   → 报告上不管几个器官写在同一页/同一段落里，都必须按器官拆成多条，itemType="imaging"，每条只对应一个器官
   → name = 该器官的检查名称原文（如"肝脏彩超""颈动脉超声""双肾输尿管膀胱彩超"），禁止把多个器官名称拼在同一个 name 里（如"甲状腺彩超、心脏彩超"这种禁止出现）
   → findings = 报告原文里"超声所见"/"检查所见"部分中，只属于该器官的那一段文字，不得掺入其他器官的描述
   → diagnosis = 报告原文里"超声提示"部分中，只属于该器官的那一句/那一条，不得掺入其他器官
   → conclusion = 同 diagnosis
   → 示例：报告里"超声提示：1.甲状腺结节；2.颈动脉未见异常；3.肝胆胰脾未见异常"这样分条列出的，必须按序号拆回各自对应的器官条目里，不能整段照抄进同一条
   → 跳过"温馨提示""健康建议"类科普说明文字（如"结石多与饮水少有关，建议..."），这类不是检查所见，不得提取为 findings

9. 肺部CT
   → itemType="imaging"，name="肺部CT"或报告原名
   → findings=检查所见，diagnosis=诊断意见，conclusion=同 diagnosis

10. 胃镜 / 肠镜
    → itemType="imaging"，每项单独一条
    → findings=检查所见/镜下所见，diagnosis=镜下诊断，conclusion=同 diagnosis

11. 胃镜病理 / 肠镜病理
    → itemType="imaging"
    → findings=大体所见，diagnosis=病理诊断，conclusion=同 diagnosis

12. 常规心电图
    → itemType="imaging"，name="心电图"
    → findings=检查所见/描述，conclusion=结论原文，diagnosis=同 conclusion

13. 睡眠呼吸监测
    → 有数值的子项用 itemType="lab"（name/value/unit/referenceRange）
    → 有描述结论的用 itemType="imaging"（findings/diagnosis/conclusion）

14. 人体成分分析
    → 有数值的子项用 itemType="lab"（name/value/unit/referenceRange）
    → 有描述结论的用 itemType="imaging"

【输出格式】
仅输出 JSON，不要任何额外文字：
{
  "institution": "体检机构名称",
  "checkDate": "YYYY-MM-DD",
  "items": [
    {
      "name": "项目名称",
      "itemType": "lab | imaging | data",
      "value": "数值（lab/data类填写）",
      "unit": "单位",
      "referenceRange": "参考范围",
      "status": "normal | abnormal | attention | unknown",
      "orderName": "所属检验单（lab类填写，如肝功能、血脂全套）",
      "bodyPart": "检查部位（imaging类可填）",
      "findings": "检查描述/所见原文（imaging/data类填写）",
      "diagnosis": "诊断意见原文（imaging类填写）",
      "conclusion": "主要结论（imaging/data类填写，与diagnosis相同；lab类留空）"
    }
  ]
}`;

function safeParseJSON(text) {
  try { return JSON.parse(String(text).trim().replace(/^```json\n?|\n?```$/g, '')); }
  catch { return null; }
}

const PATIENT_INFO_NAMES = new Set([
  '姓名', '性别', '年龄', '出生日期', '身份证号', '手机号', '电话', '联系电话',
  '单位', '工作单位', '体检日期', '体检编号', '报告编号', '科别', '部门',
  '一般情况', '主要阳性体征', '阳性体征', '体检结果汇总', '异常结果汇总',
]);

// 体格检查类项目名单——模型偶尔会把这些误标成 lab/data，提取后强制纠正为 imaging（金娟07-01反馈：眼压检查被提取成检验类型）
// 用前缀匹配而非精确相等：AI 常在名称后附加方法说明，如"眼压检查(非接触眼压计法或压平眼压计法)"
const PHYSICAL_EXAM_NAMES = ['内科', '外科', '耳鼻喉', '视力检查', '眼压检查', '眼科', '裂隙灯检查'];

function filterPatientInfoItems(items) {
  return (items || [])
    .filter(item => {
      const name = (item.name || '').trim();
      if (!name) return false;
      if (PATIENT_INFO_NAMES.has(name)) return false;
      if (/^[\d、。，,.\s]+$/.test(name)) return false;
      return true;
    })
    .map(item => {
      let name = (item.name || '').replace(/^[【\[《〔\s\d、.]+|[】\]》〕\s]+$/g, '').trim();
      // 原文里的对勾符号(✓)常被识别成多余的单个英文字母前缀（如"T双眼眼底照相"），导致同一检查因为多字对不上而没法去重
      name = name.replace(/^[A-Za-z](?=[一-龥])/, '');
      const itemType = PHYSICAL_EXAM_NAMES.some(n => name.startsWith(n)) ? 'imaging' : item.itemType;
      return { ...item, name, itemType };
    });
}

// 耳鼻喉/听力检查有时会被拆成"听力(左)""外耳道(左)""鼓膜(左)"等散项、有时主条目又被写成"耳鼻喉科"等变体、
// 偶尔还会出现内容重复的怪异行（如"外耳道(左)；耳道异物(毛发)"）——统一收拢成一条"耳鼻喉"主记录
const ENT_SUBPART_PREFIXES = ['听力', '外耳道', '鼓膜', '鼻部', '咽喉部'];
function mergeEntSubparts(items) {
  const list = items || [];
  const isMain = (name) => /^耳鼻喉(科|检查|科检查)?$/.test(str(name));
  const isSubpart = (name) => !isMain(name) && ENT_SUBPART_PREFIXES.some(p => str(name).startsWith(p));
  const mains = list.filter(it => isMain(it.name));
  const subparts = list.filter(it => isSubpart(it.name));
  if (!subparts.length && mains.length <= 1) return list; // 只有一条正常主记录、没有散项，不用处理

  const pieces = [];
  mains.forEach(it => { const f = str(it.findings) || str(it.value); if (f) pieces.push(f); });
  subparts.forEach(it => pieces.push(`${str(it.name)}：${str(it.findings) || str(it.value) || '未描述'}`));
  const mergedFindings = [...new Set(pieces.filter(Boolean))].join('；') || '未见明显异常';
  const removeSet = new Set([...mains, ...subparts]);
  const result = list.filter(it => !removeSet.has(it));
  result.push({
    name: '耳鼻喉', itemType: 'imaging', value: '', unit: '', referenceRange: '', status: 'unknown',
    orderName: '', bodyPart: '', findings: mergedFindings,
    diagnosis: mains.find(it => str(it.diagnosis))?.diagnosis || '未见明显异常',
    conclusion: mains.find(it => str(it.conclusion))?.conclusion || mains.find(it => str(it.diagnosis))?.diagnosis || '未见明显异常',
  });
  return result;
}

// 超声报告"异常结果汇总"页有时没被跳过规则拦住，被当成一条新的检查项目重复提取，内容是把好几个器官的结论压缩成一句话，
// 跟已经按器官拆开的独立记录（如"肝脏彩超""胰腺彩超"）重复——用"一条记录里同时命中几个不同器官关键词"来识别这类汇总echo
const ORGAN_GROUPS = [
  ['肝脏', '肝'], ['胆囊', '胆'], ['胰腺', '胰'], ['脾脏', '脾'],
  ['肾脏', '肾', '输尿管'], ['膀胱'], ['前列腺'], ['甲状腺'],
  ['颈动脉', '颈总动脉'], ['心脏', '心腔', '心室', '心肌'], ['乳腺'], ['子宫', '附件', '阴道'],
];
function detectOrgans(text) {
  const t = str(text);
  const hit = [];
  ORGAN_GROUPS.forEach((words, idx) => { if (words.some(w => t.includes(w))) hit.push(idx); });
  return hit;
}
function isUltrasoundItem(it) {
  return it.itemType === 'imaging' && /彩超|超声/.test(str(it.name));
}
function cleanupUltrasoundOverlap(items) {
  const list = items || [];
  const richnessOf = (o) => str(o.findings).length + str(o.diagnosis).length + str(o.conclusion).length;
  const withOrgans = list.map((it, idx) => ({
    idx,
    organs: new Set(isUltrasoundItem(it) ? detectOrgans(`${str(it.name)}${str(it.findings)}${str(it.diagnosis)}`) : []),
    richness: richnessOf(it),
  })).filter(w => w.organs.size > 0);
  if (withOrgans.length < 2) return list;

  const dropSet = new Set();

  // 第一步：只命中1个器官的记录，同一器官若有多条（如"心脏彩超"和"心脏彩超及心功能检查"重复），只保留信息量最大的一条
  const byOrgan = new Map();
  withOrgans.forEach(w => {
    if (w.organs.size !== 1) return;
    const key = [...w.organs][0];
    if (!byOrgan.has(key)) byOrgan.set(key, []);
    byOrgan.get(key).push(w);
  });
  for (const group of byOrgan.values()) {
    if (group.length < 2) continue;
    let best = group[0];
    for (const w of group) if (w.richness > best.richness) best = w;
    group.forEach(w => { if (w !== best) dropSet.add(w.idx); });
  }

  // 第二步：按信息量从多到少排序，贪心地把"内容已经被排在前面、更丰富的记录完全覆盖"的多器官记录标记为冗余丢弃。
  // 这样不管AI这次有没有按器官拆细，只要一条记录讲的器官全部都已经在别的更详细的记录里出现过，就判定它是重复的汇总echo。
  // 单器官记录永远保留（最细粒度，不应被当成冗余），只处理 organs.size>=2 的记录。
  const sorted = [...withOrgans].filter(w => !dropSet.has(w.idx)).sort((a, b) => b.richness - a.richness);
  const coveredOrgans = new Set();
  for (const w of sorted) {
    const fullyCovered = w.organs.size >= 2 && [...w.organs].every(g => coveredOrgans.has(g));
    if (fullyCovered) {
      dropSet.add(w.idx);
    } else {
      w.organs.forEach(g => coveredOrgans.add(g));
    }
  }

  return list.filter((_, idx) => !dropSet.has(idx));
}

// AI 有时会把 value 等字段直接输出成数字而不是字符串（如 18.8 而非 "18.8"），
// 后面一大堆清洗规则都要对这些字段调用 .trim()，统一用这个helper兜底转成字符串，避免 "xxx.trim is not a function" 崩溃
const str = (v) => String(v == null ? '' : v).trim();

// 清理AI提取时常见的两类"影子行"（2026-07-01金娟反馈：肿瘤六项男/血细胞分析/血脂七项 被当成具体项目名重复提取）：
// 规则1：某条目的 name 跟批次里其他≥2条目共享的 orderName 完全同名（说明这条其实是把套餐标题误当成了单独项目吐出来），丢弃
// 规则2：同一 orderName 组内，value/unit/referenceRange 完全相同的重复行只保留第一条
// 规则3：全字段维度完全同名同值的整行重复（如同一份报告两页都提取到"脉搏"），只保留信息更完整的一条
function cleanupExtractedItems(items) {
  const list = items || [];
  const orderNameCount = new Map();
  list.forEach(it => {
    const on = str(it.orderName);
    if (on) orderNameCount.set(on, (orderNameCount.get(on) || 0) + 1);
  });

  const byOrderGroup = new Map();
  const afterRule1 = list.filter(it => {
    const name = str(it.name);
    if (name && orderNameCount.get(name) >= 2) return false; // 规则1
    return true;
  });

  // 规则2 只丢弃"名字本身看起来就是套餐标题"的那一条（如"血脂七项""肿瘤六项男(不含...)"），
  // 不能只看数值相同就丢——像抗核抗体谱15项这种子项结果全是"阴性"的正常面板，数值本来就会大量重复，
  // 之前没加这个名字判断，导致15条阴性被误判成"重复行"只保留了1条
  const looksLikePanelTitle = (name) => {
    const n = str(name);
    if (!n) return false;
    if (/[（(][^）)]*(不含|全套)[^）)]*[）)]$/.test(n)) return true;
    if (/^.{1,10}(全套|十[一二三四五六七八九]?项|[二三四五六七八九]项|两项)/.test(n)) return true;
    return false;
  };
  const valueSeenInGroup = new Map();
  const afterRule2 = afterRule1.filter(it => {
    const on = str(it.orderName);
    if (!on) return true;
    const valueKey = `${str(it.value)}|${str(it.unit)}|${str(it.referenceRange)}`;
    if (!valueKey.replace(/\|/g, '').trim()) return true; // 值都是空的不去重
    const groupKey = `${on}::${valueKey}`;
    if (!valueSeenInGroup.has(groupKey)) { valueSeenInGroup.set(groupKey, it); return true; }
    // 已经见过同样数值的一条：只有当前这条"看起来像套餐标题"时才丢弃，避免误伤真实的同值子项
    return !looksLikePanelTitle(it.name);
  });

  const dedupMap = new Map();
  const scoreCompleteness = o => ['referenceRange', 'orderName', 'findings', 'diagnosis', 'conclusion', 'bodyPart']
    .filter(f => str(o[f])).length;
  const result = [];
  afterRule2.forEach(it => {
    const key = `${it.itemType}|${str(it.name)}|${str(it.value)}|${str(it.unit)}`;
    if (!dedupMap.has(key)) { dedupMap.set(key, result.length); result.push(it); return; }
    const idx = dedupMap.get(key);
    if (scoreCompleteness(it) > scoreCompleteness(result[idx])) result[idx] = it; // 规则3
  });

  // 规则4：同名但数值不同的重复行（如"尿液干化学分析"一次只提到尿隐血异常、另一次把11项明细都写全）——
  // 同一次体检里同名项目出现两次基本都是同一处内容被分两页/两批次各提取了一遍，保留信息量更大的一条
  const richness = o => str(o.findings).length + str(o.diagnosis).length + str(o.conclusion).length
    + ['referenceRange', 'orderName', 'findings', 'diagnosis', 'conclusion', 'bodyPart'].filter(f => str(o[f])).length * 5;
  const byName = new Map();
  result.forEach((it, idx) => {
    const n = str(it.name);
    if (!n) return;
    const on = str(it.orderName);
    const groupKey = `${n}::${on || n}`; // orderName 为空时退化用 name 本身，让"没填orderName"和"orderName就是自己"两种写法能配到一组
    if (!byName.has(groupKey)) byName.set(groupKey, []);
    byName.get(groupKey).push(idx);
  });
  const drop4 = new Set();
  for (const idxs of byName.values()) {
    if (idxs.length < 2) continue;
    let bestIdx = idxs[0];
    for (const idx of idxs) if (richness(result[idx]) > richness(result[bestIdx])) bestIdx = idx;
    idxs.forEach(idx => { if (idx !== bestIdx) drop4.add(idx); });
  }
  let final = result.filter((_, idx) => !drop4.has(idx));

  // 规则5：血压这项数值必须是"数字/数字"格式（如120/73），不是这个格式说明是别的检查内容串行填错了，丢弃
  final = final.filter(it => {
    if (str(it.name) !== '血压') return true;
    const v = str(it.value);
    return !v || /^\d{2,3}\s*\/\s*\d{2,3}/.test(v);
  });

  return final;
}

// 按 key（格式 <L1的_id>|<L2名字>|<叶子名字>）upsert 一条 UserScreeningItem，AI自动归类和医护手动录入共用此函数，
// 保证两条入口写入同一份"当前状态"索引，同一 itemId 全局唯一一条，reportId 记录最新数据来源
async function upsertScreeningKey(userId, reportId, key, fallbackName) {
  const parts = String(key).split('|');
  await UserScreeningItem.updateOne(
    { user: userId, itemId: key },
    { $set: { category: parts[0] || '', parentLabel: parts[1] || '', itemLabel: parts[2] || fallbackName || '', status: 'completed', reportId } },
    { upsert: true }
  );
}

// 将报告已归类项同步写入 UserScreeningItem（upsert，每个 key 全局唯一一条，reportId 记录最新来源）
// 每条 reportItem 可携带多个 screeningKeys，每个 key 写一条 UserScreeningItem 记录
async function syncScreeningItems(userId, reportId, items) {
  try {
    const matched = (items || []).filter(it => it.matchStatus === 'matched');
    let syncCount = 0;
    for (const it of matched) {
      const keys = (it.screeningKeys && it.screeningKeys.length)
        ? it.screeningKeys
        : (it.screeningKey ? [it.screeningKey] : []);
      for (const key of keys) {
        await upsertScreeningKey(userId, reportId, key, it.name);
        syncCount++;
      }
    }
    if (syncCount) console.log(`[screening-sync] userId=${userId} reportId=${reportId} 同步${syncCount}项`);
  } catch (err) {
    console.error('[screening-sync] 失败', String(reportId), err.message);
  }
}

// 从检验单标题解析出"应有条数"，如"抗核抗体谱15项"→15，"肝功能八项"→8，中文数字/阿拉伯数字都支持
const CN_NUM = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
function parseExpectedCount(orderName) {
  const s = String(orderName || '');
  const m = s.match(/([0-9]+|[一二两三四五六七八九十]+)\s*项/);
  if (!m) return null;
  const raw = m[1];
  if (/^[0-9]+$/.test(raw)) return parseInt(raw, 10);
  if (raw.length === 1) return CN_NUM[raw] || null;
  if (raw.length === 2 && raw[0] === '十') return 10 + (CN_NUM[raw[1]] || 0);
  if (raw.length === 2 && raw[1] === '十') return (CN_NUM[raw[0]] || 0) * 10;
  return null;
}

// 检查按检验单分组后，是否有组的实际条数少于标题声明的条数（如"抗核抗体谱15项"只提取到1条）；
// 有则返回需要重新识别的页码集合（同一页可能命中多个不足的检验单，去重）
function findUnderExtractedPages(items) {
  const byOrder = new Map();
  (items || []).forEach(it => {
    const on = str(it.orderName);
    if (!on) return;
    if (!byOrder.has(on)) byOrder.set(on, []);
    byOrder.get(on).push(it);
  });
  const pagesToRetry = new Set();
  const underOrders = [];
  for (const [orderName, group] of byOrder) {
    const expected = parseExpectedCount(orderName);
    if (!expected || group.length >= expected) continue;
    underOrders.push({ orderName, expected, actual: group.length });
    group.forEach(it => { if (it._page) pagesToRetry.add(it._page); });
  }
  return { pagesToRetry: [...pagesToRetry], underOrders };
}

// 后台执行报告 AI 解析（不阻塞 HTTP 响应；完成后状态置 pending 待人工审核）
async function runReportParse(reportId) {
  const { parseImage } = require('../utils/ai');
  const { fetchReportBuffer, pdfBufferToImages, isPdfReport, renderSinglePage } = require('../utils/pdf');
  const { classifyItemsAsync } = require('../utils/screeningMatch');
  const MedicalReport = require('../models/MedicalReport');
  const report = await MedicalReport.findById(reportId);
  if (!report) return;

  const isPdf = isPdfReport(report);
  const t0 = Date.now();
  try {
    if (isPdf) {
      const pdfBuf = await fetchReportBuffer(report, UPLOADS_DIR);
      console.log(`[parse-ai] PDF开始 ${reportId} 大小${(pdfBuf.length/1024/1024).toFixed(1)}MB 分批处理(每批8页/96dpi)`);

      const VL_MODEL = 'qwen-vl-plus'; // 实测比max快2.8倍、指令遵从性优于ocr-latest
      const CONCURRENCY = 3;
      const BATCH_SIZE = 8;
      const DPI = 96;

      let allItems = [];
      const summaries = [];
      let institution = report.institution;
      let checkDate = report.checkDate;
      let totalPageCount = 0;
      let okPages = 0;

      // onBatch：每批图片转出后立即识别，识别完就释放这批图片内存
      await pdfBufferToImages(pdfBuf, {
        dpi: DPI,
        batchSize: BATCH_SIZE,
        onBatch: async (batchImages, batchIndex) => {
          totalPageCount += batchImages.length;
          console.log(`[parse-ai] PDF批次${batchIndex + 1} ${reportId} ${batchImages.length}页`);

          const batchResults = new Array(batchImages.length).fill(null);
          let cursor = 0;
          const worker = async () => {
            while (cursor < batchImages.length) {
              const i = cursor++;
              for (let attempt = 0; attempt < 2; attempt++) {
                try {
                  const text = await parseImage(batchImages[i], REPORT_PARSE_PROMPT, { isUrl: false, model: VL_MODEL, maxTokens: 4096 });
                  const p = safeParseJSON(text);
                  if (p) { batchResults[i] = p; break; }
                  if (attempt === 1) console.log(`[parse-ai] 页${i + 1}解析失败 raw(前200)=${String(text).slice(0, 200)}`);
                } catch (e) { if (attempt === 1) console.log(`[parse-ai] 页${i + 1}异常: ${e.message}`); }
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batchImages.length) }, worker));

          for (let i = 0; i < batchResults.length; i++) {
            const p = batchResults[i];
            if (!p) continue;
            okPages++;
            const pageNum = batchIndex * BATCH_SIZE + i + 1;
            if (Array.isArray(p.items)) {
              allItems = allItems.concat(
                p.items.filter(it => it.name && String(it.name).trim()).map(it => ({ ...it, _page: pageNum }))
              );
            }
            if (p.summary) summaries.push(p.summary);
            if (!institution && p.institution) institution = p.institution;
            if (!checkDate && p.checkDate) checkDate = p.checkDate;
          }
        },
      });

      // 数量核对+单页重试：检验单标题写了"N项"但实际条数不够，说明这一页大概率漏提了，只重新识别这一页
      const { pagesToRetry, underOrders } = findUnderExtractedPages(allItems);
      if (pagesToRetry.length) {
        console.log(`[parse-ai] 数量核对不通过 ${reportId}：${underOrders.map(o => `${o.orderName}(应${o.expected}实${o.actual})`).join('、')}，重试页${pagesToRetry.join(',')}`);
        for (const pageNum of pagesToRetry) {
          try {
            const img = await renderSinglePage(pdfBuf, pageNum, DPI);
            if (!img) continue;
            const retryPrompt = REPORT_PARSE_PROMPT + `\n\n【补充提醒】本页曾提取到条数明显少于标题声明数量的检验单：${underOrders.filter(o => allItems.some(it => it._page === pageNum && it.orderName === o.orderName)).map(o => `"${o.orderName}"（标题写${o.expected}项，之前只提取到${o.actual}项）`).join('、')}。请重新逐行核对该检验单在图片中的每一行，确保每一个子项都单独输出一条，不得合并、省略或遗漏任何一行，即使多行结果完全相同（如都是阴性）也要逐条列出。`;
            const text = await parseImage(img, retryPrompt, { isUrl: false, model: VL_MODEL, maxTokens: 4096 });
            const p = safeParseJSON(text);
            if (!p || !Array.isArray(p.items)) continue;
            const retryItems = p.items.filter(it => it.name && String(it.name).trim()).map(it => ({ ...it, _page: pageNum }));
            // 按检验单标题替换：只替换这一页里、这次重试确实提取到更多条数的那些检验单，其余保留原结果，避免"重试反而更差"
            const retryByOrder = new Map();
            retryItems.forEach(it => {
              const on = str(it.orderName);
              if (!on) return;
              if (!retryByOrder.has(on)) retryByOrder.set(on, []);
              retryByOrder.get(on).push(it);
            });
            let improvedOrders = [];
            for (const [on, newGroup] of retryByOrder) {
              const oldCount = allItems.filter(it => it._page === pageNum && str(it.orderName) === on).length;
              if (newGroup.length > oldCount) improvedOrders.push(on);
            }
            if (improvedOrders.length) {
              allItems = allItems.filter(it => !(it._page === pageNum && improvedOrders.includes(str(it.orderName))));
              improvedOrders.forEach(on => { allItems = allItems.concat(retryByOrder.get(on)); });
              console.log(`[parse-ai] 页${pageNum}重试生效：${improvedOrders.join('、')} 条数已补全`);
            } else {
              console.log(`[parse-ai] 页${pageNum}重试未改善，保留原结果`);
            }
          } catch (e) {
            console.log(`[parse-ai] 页${pageNum}重试异常: ${e.message}`);
          }
        }
      }
      // 超声多器官未拆分检测+单页重试：肝胆胰脾等常同页出现的器官，若一条记录里同时命中≥2个器官说明没拆开，重试这一页要求按器官拆分
      const multiOrganPages = [...new Set(
        allItems.filter(it => isUltrasoundItem(it) && detectOrgans(`${str(it.name)}${str(it.findings)}${str(it.diagnosis)}`).length >= 2).map(it => it._page)
      )].filter(Boolean);
      for (const pageNum of multiOrganPages) {
        try {
          const beforeMaxOrgans = Math.max(...allItems.filter(it => it._page === pageNum && isUltrasoundItem(it))
            .map(it => detectOrgans(`${str(it.name)}${str(it.findings)}${str(it.diagnosis)}`).length), 0);
          const img = await renderSinglePage(pdfBuf, pageNum, DPI);
          if (!img) continue;
          const retryPrompt = REPORT_PARSE_PROMPT + `\n\n【补充提醒】本页曾把多个器官的超声内容合并写进了同一条记录（如肝、胆、胰、脾写在一起）。请重新逐句核对"超声所见"和"超声提示"部分，严格按器官各自拆成独立的一条记录，禁止把两个及以上器官的检查所见/诊断意见写进同一条 findings 或 diagnosis 里。`;
          const text = await parseImage(img, retryPrompt, { isUrl: false, model: VL_MODEL, maxTokens: 4096 });
          const p = safeParseJSON(text);
          if (!p || !Array.isArray(p.items)) continue;
          const retryItems = p.items.filter(it => it.name && String(it.name).trim()).map(it => ({ ...it, _page: pageNum }));
          const afterMaxOrgans = Math.max(...retryItems.filter(it => isUltrasoundItem(it))
            .map(it => detectOrgans(`${str(it.name)}${str(it.findings)}${str(it.diagnosis)}`).length), 0);
          if (afterMaxOrgans > 0 && afterMaxOrgans < beforeMaxOrgans) {
            allItems = allItems.filter(it => it._page !== pageNum).concat(retryItems);
            console.log(`[parse-ai] 页${pageNum}超声拆分重试生效：单条最多命中器官数 ${beforeMaxOrgans}→${afterMaxOrgans}`);
          } else {
            console.log(`[parse-ai] 页${pageNum}超声拆分重试未改善，保留原结果`);
          }
        } catch (e) {
          console.log(`[parse-ai] 页${pageNum}超声拆分重试异常: ${e.message}`);
        }
      }

      allItems = allItems.map(({ _page, ...rest }) => rest); // 内部字段，落库前去掉

      const filteredItems = cleanupUltrasoundOverlap(mergeEntSubparts(cleanupExtractedItems(filterPatientInfoItems(allItems))));
      const classified = await classifyItemsAsync(filteredItems);
      const matchedCount = classified.filter(i => i.matchStatus === 'matched').length;
      const summaryText = [...new Set(summaries.map(s => s.trim()).filter(Boolean))].join('\n');
      const failedPages = totalPageCount - okPages;
      const allFailed = totalPageCount > 0 && okPages === 0;
      const aiSummaryOut = allFailed
        ? `⚠️ 自动识别失败：全部${totalPageCount}页均未能识别成功（可能是AI服务额度不足或网络异常），未提取到任何数据，请重新识别或人工录入`
        : failedPages > 0
          ? `${summaryText}${summaryText ? '\n' : ''}⚠️ 有${failedPages}/${totalPageCount}页识别失败，请核对是否有遗漏项目`
          : summaryText;
      await MedicalReport.findByIdAndUpdate(reportId, {
        reportItems: classified,
        aiSummary:   aiSummaryOut,
        aiStatus:    'pending',
        institution, checkDate,
      });
      const totalMs = Date.now() - t0;
      console.log(`[parse-ai] PDF完成 ${reportId} 共${totalPageCount}页 成功${okPages}页 提取${allItems.length}项 归类${matchedCount}项 | 总耗时${(totalMs/1000).toFixed(1)}s`);
      return;
    }

    // 图片：统一取文件 buffer 转 base64（兼容 content / OSS / 本地路径）
    const buf = await fetchReportBuffer(report, UPLOADS_DIR);
    let text, parsed;
    try {
      text = await parseImage(buf.toString('base64'), REPORT_PARSE_PROMPT, { isUrl: false, model: 'qwen-vl-plus', maxTokens: 4096 });
      parsed = safeParseJSON(text);
    } catch (e) {
      console.log(`[parse-ai] 图片解析异常 ${reportId}: ${e.message}`);
    }
    const classifiedImg = await classifyItemsAsync(cleanupUltrasoundOverlap(mergeEntSubparts(cleanupExtractedItems(filterPatientInfoItems(parsed?.items || [])))));
    const imgSummary = parsed
      ? (parsed.summary || '')
      : `⚠️ 自动识别失败：未能提取到数据（可能是AI服务额度不足或网络异常），请重新识别或人工录入${text ? '\n原始返回(前200字): ' + String(text).slice(0, 200) : ''}`;
    await MedicalReport.findByIdAndUpdate(reportId, {
      reportItems: classifiedImg,
      aiSummary:   imgSummary,
      aiStatus:    'pending',
      institution: parsed?.institution || report.institution,
      checkDate:   parsed?.checkDate   || report.checkDate,
    });
    console.log(`[parse-ai] 图片完成 ${reportId} 提取${parsed?.items?.length || 0}项 自动归类${classifiedImg.filter(i=>i.matchStatus==='matched').length}项 | 总耗时${((Date.now()-t0)/1000).toFixed(1)}s`);
  } catch (e) {
    console.error('[parse-ai] 解析失败', String(reportId), e.message);
    await MedicalReport.findByIdAndUpdate(reportId, {
      aiStatus: 'pending',
      aiSummary: '自动识别失败：' + e.message + '（请人工录入或重新识别）',
    }).catch(() => {});
  }
}

// POST /api/staff/medical-reports/:id/parse-ai — 医护端触发AI解析（异步）
router.post('/medical-reports/:id/parse-ai', staffAuth, async (req, res) => {
  try {
    const { isPdfReport } = require('../utils/pdf');
    const MedicalReport = require('../models/MedicalReport');
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });

    const hasFile = !!report.fileUrl || !!report.content;
    const isImage = report.mimeType?.startsWith('image/');
    const isPdf = isPdfReport(report);

    if (!hasFile) {
      return res.status(400).json({ success: false, message: '报告无文件内容，无法解析' });
    }
    if (!process.env.QWEN_API_KEY) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: '未配置AI密钥，已加入人工审核队列' });
    }
    if (!isImage && !isPdf) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: '该格式暂不支持自动解析，已加入待审核队列' });
    }
    if (report.aiStatus === 'processing') {
      return res.json({ success: true, processing: true, message: '正在识别中，请稍候刷新' });
    }

    // 标记处理中，立即返回；识别在后台进行，避免多页 PDF 阻塞请求超时
    await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'processing' });
    runReportParse(report._id).catch(err => {
      console.error('[parse-ai] 后台任务异常', String(report._id), err.message);
      MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' }).catch(() => {});
    });

    res.json({
      success: true,
      processing: true,
      message: isPdf
        ? 'PDF识别已开始，多页报告约需 1–3 分钟，完成后状态自动变为「待审核」'
        : 'AI识别已开始，约需数秒，完成后状态自动变为「待审核」',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'AI解析失败：' + err.message });
  }
});

// GET /api/staff/diag/pdf — 诊断 pdftoppm 是否可用
router.get('/diag/pdf', staffAuth, async (req, res) => {
  const { execFile } = require('child_process');
  execFile('pdftoppm', ['-v'], (err, stdout, stderr) => {
    res.json({
      available: !err || stderr.includes('pdftoppm'),
      version: stderr || stdout || '',
      error: err ? err.message : null,
      uploadsDir: UPLOADS_DIR,
      uploadsDirExists: require('fs').existsSync(UPLOADS_DIR),
    });
  });
});

// GET /api/staff/screening-catalog — 专项筛查归类下拉（只从 admin 配置的 LabTestPackage 读取）
// 格式：[{ label: 'L1分类', opts: [{ value: 'L1|L2|itemName', label: 'itemName' }] }]
router.get('/screening-catalog', staffAuth, async (req, res) => {
  try {
    const [cats, pkgs] = await Promise.all([
      ProjectCategory.find({ status: 'active' }).lean(),
      LabTestPackage.find({ status: 'active' })
        .populate('labTestItems', 'name')
        .populate({ path: 'specialExams', match: { deleted: { $ne: true } }, select: 'name' })
        .lean(),
    ]);

    const l1s = cats.filter(c => !c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const l2sByParent = {};
    cats.filter(c => c.parent).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).forEach(c => {
      const pid = String(c.parent);
      if (!l2sByParent[pid]) l2sByParent[pid] = [];
      l2sByParent[pid].push(c);
    });
    const pkgByCat = {};
    pkgs.forEach(p => {
      if (!p.categoryId) return;
      const cid = String(p.categoryId);
      if (!pkgByCat[cid]) pkgByCat[cid] = [];
      pkgByCat[cid].push(p);
    });

    // 构建归类选项：L1分类 → 组标题，L2(package) + item → 选项
    // value 格式：<L1name>|<packageName>|<itemName>（与 screeningTree itemId 格式一致）
    const groups = [];
    for (const l1 of l1s) {
      const opts = [];
      const l2cats = l2sByParent[String(l1._id)] || [];
      for (const l2 of l2cats) {
        const matchPkgs = pkgByCat[String(l2._id)] || [];
        for (const pkg of matchPkgs) {
          // 套餐本身作为一个归类选项
          opts.push({ value: `${l1.name}|${pkg.name}|${pkg.name}`, label: pkg.name, groupLabel: l1.name });
          // 套餐下的检验项目
          (pkg.labTestItems || []).forEach(item => {
            if (item && item.name) {
              opts.push({ value: `${l1.name}|${pkg.name}|${item.name}`, label: `${pkg.name} / ${item.name}`, groupLabel: l1.name });
            }
          });
          // 套餐下的检查医嘱
          (pkg.specialExams || []).forEach(exam => {
            if (exam && exam.name) {
              opts.push({ value: `${l1.name}|${pkg.name}|${exam.name}`, label: `${pkg.name} / ${exam.name}`, groupLabel: l1.name });
            }
          });
        }
      }
      if (opts.length > 0) groups.push({ label: l1.name, opts });
    }

    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /staff/patients/:id/reports/:rid/reclassify — 对报告里 unclassified 项重跑自动归类
router.post('/patients/:id/reports/:rid/reclassify', staffAuth, async (req, res) => {
  try {
    const report = await MedicalReport.findOne({ _id: req.params.rid, user: req.params.id }).lean();
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    const { classifyItemsAsync } = require('../utils/screeningMatch');
    const reclassified = await classifyItemsAsync(report.reportItems || []);
    await MedicalReport.findByIdAndUpdate(report._id, { reportItems: reclassified });
    const matchedCount = reclassified.filter(i => i.matchStatus === 'matched').length;
    res.json({ success: true, data: reclassified, matchedCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 问卷 → 健康档案 自动导入（DynamicQuestionnaire/QuestionnaireResponse 已在文件顶部 require）──
const { buildArchiveDraft } = require('../utils/archiveImport');

// GET /api/staff/patients/:id/questionnaire-responses — 该会员有档案映射的已答问卷列表（手动导入用）
router.get('/patients/:id/questionnaire-responses', staffAuth, async (req, res) => {
  try {
    const responses = await QuestionnaireResponse.find({ user: req.params.id })
      .populate('questionnaire', 'title questions').sort({ submittedAt: -1 }).lean();
    const data = responses
      .filter(r => r.questionnaire && (r.questionnaire.questions || []).some(q => q.archiveField))
      .map(r => ({ responseId: r._id, questionnaireId: r.questionnaire._id, title: r.questionnaire.title, submittedAt: r.submittedAt }));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/archive-draft — 手动从某份答卷生成档案草稿
router.post('/patients/:id/archive-draft', staffAuth, async (req, res) => {
  try {
    const { responseId } = req.body;
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: '会员不存在' });
    let response;
    if (responseId) {
      response = await QuestionnaireResponse.findOne({ _id: responseId, user: req.params.id }).lean();
    } else {
      // 取最近一份有档案映射的答卷
      const responses = await QuestionnaireResponse.find({ user: req.params.id })
        .populate('questionnaire', 'title questions').sort({ submittedAt: -1 }).lean();
      response = responses.find(r => r.questionnaire && (r.questionnaire.questions || []).some(q => q.archiveField));
    }
    if (!response) return res.status(404).json({ success: false, message: '未找到可导入的问卷答卷' });
    const questionnaire = response.questionnaire?.questions
      ? response.questionnaire
      : await DynamicQuestionnaire.findById(response.questionnaire).lean();
    if (!questionnaire) return res.status(404).json({ success: false, message: '问卷不存在' });
    const draft = buildArchiveDraft(user, questionnaire, response);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { archiveDraft: draft } }
    );
    res.json({ success: true, data: draft });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/archive-draft/apply — 审核写入：把选定字段写入档案，清空草稿
router.post('/patients/:id/archive-draft/apply', staffAuth, async (req, res) => {
  try {
    const { items } = req.body; // [{ path, value }]
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: '没有要写入的字段' });
    const { FIELD_MAP } = require('../config/archiveFields');
    const $set = {};
    for (const it of items) {
      if (!FIELD_MAP[it.path]) continue; // 只允许白名单字段
      $set[it.path] = it.value;
    }
    if (Object.keys($set).length === 0) return res.status(400).json({ success: false, message: '没有有效字段' });
    $set.archiveDraft = null; // 写入后清空草稿
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, { $set });
    res.json({ success: true, message: `已写入 ${Object.keys($set).length - 1} 个档案字段` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/archive-draft/dismiss — 忽略草稿
router.post('/patients/:id/archive-draft/dismiss', staffAuth, async (req, res) => {
  try {
    await User.collection.updateOne({ _id: new mongoose.Types.ObjectId(req.params.id) }, { $set: { archiveDraft: null } });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景11：AI开单建议（从年度管理方案的异常复查提醒生成） ─────────────────────────
// POST /api/staff/patients/:id/ai-exam-requisition-suggest
// 返回 { title, notes, suggestions: string[] }，不创建记录，由医护手动开单
router.post('/patients/:id/ai-exam-requisition-suggest', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    // 读取最新年度管理方案中的异常复查板块
    const latestPlan = await AnnualPlan.findOne({ patientId: user._id })
      .sort({ year: -1, updatedAt: -1 }).lean();

    const abnormalItems = (latestPlan?.moduleData?.abnormal_followup?.records || []);
    const monitoringItems = (latestPlan?.moduleData?.monitoring?.records || []);

    const { chat } = require('../utils/ai');

    const abnormalText = abnormalItems.length
      ? abnormalItems.map(i => `· ${i.items || ''}：${i.reason || ''}（计划时间：${i.time || '未定'}）`).join('\n')
      : '无';
    const monitoringText = monitoringItems.length
      ? monitoringItems.map(i => `· ${i.items || ''}，频次：${i.frequency || ''}`).join('\n')
      : '无';

    const prompt = `你是一位家庭医师助理，请根据患者信息和异常复查提醒，生成本次检查开单建议。

【患者基本信息】
姓名：${user.name}，年龄：${user.age || '未知'}岁，慢病标签：${user.chronicDiseases?.join('、') || '无'}

【年度管理方案·异常复查提醒】
${abnormalText}

【日常监测项目】
${monitoringText}

请以JSON格式输出以下字段，仅输出JSON：
{
  "title": "开单标题（简洁，如：2026年异常复查开单）",
  "notes": "整体备注（包含复查背景、注意事项，50字以内）",
  "suggestions": ["具体检查项目名称1", "项目名称2", "项目名称3"]
}

建议项目应具体（如"TSH促甲状腺激素"而非泛称"甲状腺检查"），3-8个项目为宜。`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 800 });
    let result = { title: '检查开单', notes: '', suggestions: [] };
    try {
      const m = text.trim().match(/\{[\s\S]*\}/);
      if (m) result = { ...result, ...JSON.parse(m[0]) };
    } catch {}

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 场景8：AI营养干预方案（营养师审核） ──────────────────────────────────────────
// POST /api/staff/patients/:id/ai-nutrition-plan
// 创建 HealthPlan type='nutrition' status='draft' content.aiStatus='pending'
router.post('/patients/:id/ai-nutrition-plan', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile lifestyle_data aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const supplements = await Supplement.find({ user: user._id, stopped: false }).select('name dosage purpose').lean();
    const { chat } = require('../utils/ai');

    const allergyInfo = [user.healthProfile?.foodAllergy, user.healthProfile?.drugAllergy].filter(Boolean).join('；') || '无';
    const supText = supplements.length ? supplements.map(s => `${s.name}（${s.dosage}）：${s.purpose || ''}`).join('、') : '无';
    const lifestyle = user.lifestyle_data || {};

    const prompt = `你是一位注册营养师，请根据患者信息生成个性化营养干预方案。

【患者信息】
姓名：${user.name}，年龄：${user.age || '未知'}岁，慢病标签：${user.chronicDiseases?.join('、') || '无'}
食物过敏/忌口：${allergyInfo}
当前营养素补充：${supText}
饮食习惯：${lifestyle.diet || '未记录'}，运动习惯：${lifestyle.exercise || '未记录'}

请以JSON格式输出方案，仅输出JSON：
{
  "title": "方案名称（如：2026年${user.name}营养干预方案）",
  "description": "方案简介（100字以内）",
  "items": [
    { "name": "早餐方案", "category": "营养干预", "notes": "具体早餐建议，含食物种类和分量" },
    { "name": "午餐方案", "category": "营养干预", "notes": "具体午餐建议" },
    { "name": "晚餐方案", "category": "营养干预", "notes": "具体晚餐建议" },
    { "name": "加餐方案", "category": "营养干预", "notes": "两餐间加餐建议（若需要）" },
    { "name": "运动建议", "category": "运动康复", "notes": "每周运动频次、类型、强度" },
    { "name": "营养素补充建议", "category": "营养干预", "notes": "具体补充剂建议，含剂量和时机" }
  ]
}

注意：需结合慢病标签和忌口调整方案，items至少4条，每条notes要具体可执行。`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1500 });
    let raw = {};
    try {
      const m = text.trim().match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    } catch {}

    const plan = await HealthPlan.create({
      patientId: user._id,
      staffId: req.staff._id,
      type: 'nutrition',
      title: raw.title || `${new Date().getFullYear()}年${user.name}营养干预方案`,
      description: raw.description || '',
      year: new Date().getFullYear(),
      items: (raw.items || []).map(i => ({
        name: i.name || '',
        category: i.category || '营养干预',
        notes: i.notes || '',
        status: 'pending',
      })),
      content: { aiStatus: 'pending', aiGeneratedBy: req.staff.name || '' },
      status: 'draft',
    });

    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 场景6：AI年度体检方案（健管专员审核） ──────────────────────────────────────
// POST /api/staff/patients/:id/ai-annual-checkup-plan
// 创建 HealthPlan type='annual_checkup' status='draft' content.aiStatus='pending'
router.post('/patients/:id/ai-annual-checkup-plan', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const year = new Date().getFullYear();
    const { chat } = require('../utils/ai');

    // 读取历史体检方案供参考
    const lastCheckupPlan = await HealthPlan.findOne({ patientId: user._id, type: 'annual_checkup' })
      .sort({ createdAt: -1 }).lean();
    const lastCheckupItemNames = (lastCheckupPlan?.items || []).map(i => i.name).join('、') || '无';

    const riskSummary = user.aiRiskAssessment?.overallSummary || '未进行AI风险评估';

    const prompt = `你是一位健康管理专员，请根据患者信息为其生成${year}年度体检方案。

【患者信息】
姓名：${user.name}，年龄：${user.age || '未知'}岁，性别：${user.gender || '未知'}
慢病标签：${user.chronicDiseases?.join('、') || '无'}
AI风险摘要：${riskSummary}
去年体检项目（参考，避免重复）：${lastCheckupItemNames}

请以JSON格式输出方案，仅输出JSON：
{
  "title": "方案名称（如：2026年${user.name}年度体检方案）",
  "description": "方案说明（50字以内）",
  "items": [
    { "name": "项目名称", "category": "检验检查|影像检查|体格检查|专项检查", "scheduledDate": "${year}-09-01", "notes": "注意事项（如空腹/带历史报告等）" }
  ]
}

说明：
- 常规体检必选：血常规、生化全套、血糖、血脂、甲状腺功能（含TSH）、尿常规
- 根据慢病标签增加专项：桥本/甲减→甲状腺抗体TPO/TgAb+甲状腺超声；高血压→心电图+颈动脉超声；糖尿病→HbA1c+眼底检查
- 年龄>40建议：肿瘤标志物（AFP/CEA/CA125等）、胸部低剂量CT
- 共8-15个项目，scheduledDate集中在${year}年9-11月，重点项目安排早一些`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1500 });
    let raw = {};
    try {
      const m = text.trim().match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    } catch {}

    const plan = await HealthPlan.create({
      patientId: user._id,
      staffId: req.staff._id,
      type: 'annual_checkup',
      title: raw.title || `${year}年${user.name}年度体检方案`,
      description: raw.description || '',
      year,
      items: (raw.items || []).map(i => ({
        name: i.name || '',
        category: i.category || '检验检查',
        scheduledDate: i.scheduledDate ? new Date(i.scheduledDate) : null,
        notes: i.notes || '',
        status: 'pending',
      })),
      content: { aiStatus: 'pending', aiGeneratedBy: req.staff.name || '' },
      status: 'draft',
    });

    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
