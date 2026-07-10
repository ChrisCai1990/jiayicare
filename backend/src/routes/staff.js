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
const { getCurrentTenantId, BYPASS } = require('../utils/tenantScope');
// 聚合管道($aggregate)不会被 tenantScopePlugin 的 query 中间件自动拦截，需要在 $match 里手动拼入 tenantId
const tenantMatchStage = () => {
  const tenantId = getCurrentTenantId();
  return (tenantId && tenantId !== BYPASS) ? { tenantId } : {};
};
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
const Coupon = require('../models/Coupon');
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
const checkPermission = require('../middleware/checkPermission');
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
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 支持各类图片（含手机 HEIC）+ PDF；医院电子报告常为 PDF，客户手机拍照也可能是 HEIC
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('仅支持图片（JPG/PNG/HEIC 等）或 PDF 文件'));
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

// GET /api/staff/service-options — 医护端归类时「服务包」下拉选项
// 2026-07-10 金娟：服务包=admin商城产品里「年度健康计划」分类下的产品（健康预防/维稳/重塑/年轻态/更年期/轻享等）
router.get('/service-options', staffAuth, async (req, res) => {
  try {
    const Product = require('../models/Product');
    const products = await Product.find({ category: '年度健康计划' }).sort({ sortOrder: 1, createdAt: 1 }).select('name');
    res.json({ success: true, data: products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/staff/member-source-options — 医护端「会员来源」下拉选项（读 admin 配好的会员来源）
router.get('/member-source-options', staffAuth, async (req, res) => {
  try {
    const MemberSource = require('../models/MemberSource');
    const sources = await MemberSource.find({ status: 'active' }).sort({ createdAt: 1 }).select('name');
    res.json({ success: true, data: sources });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 获取某员工所有下属 ID（递归一层，支持组长看下属）
async function getSubordinateIds(staffId) {
  const subs = await Admin.find({ managerId: staffId }).select('_id');
  return subs.map(s => s._id);
}

// 获取某员工作为"团队导师"时能额外看到的团队成员 ID。
// 只有当该员工是某个团队的 mentorId 时，才返回该团队全体成员（含自己，去重由调用方处理）；
// 普通成员不因所属团队而扩大可见范围——只有导师能看全团队。
const Team = require('../models/Team');
async function getMentoredTeamMemberIds(staffId) {
  const teams = await Team.find({ mentorId: staffId, status: 'active' }).select('_id');
  if (!teams.length) return [];
  const teamIds = teams.map(t => t._id);
  const members = await Admin.find({ teamId: { $in: teamIds } }).select('_id');
  return members.map(m => m._id);
}

// 汇总某员工在患者归属过滤中的可见 staffId 集合：本人 + 下属 + （作为导师时）团队成员
async function getVisibleStaffIds(staff) {
  const ids = [staff._id];
  const [subIds, teamMemberIds] = await Promise.all([
    getSubordinateIds(staff._id),
    getMentoredTeamMemberIds(staff._id),
  ]);
  const all = [...ids, ...subIds, ...teamMemberIds].map(String);
  return [...new Set(all)];
}

// ── GET /api/staff/patients ───────────────────────────────────────
// 查询分配给当前医护人员（及其下属）的患者列表
router.get('/patients', staffAuth, checkPermission('patients', 'view'), async (req, res) => {
  const { page = 1, limit = 20, search = '', disease = '', type = '' } = req.query;
  const staff = req.staff;

  // 超管看全部，其他角色只看分配给自己（及下属）的患者
  let staffIds = [staff._id];
  const mentoredIds = staff.role !== 'superadmin' ? await getMentoredTeamMemberIds(staff._id) : [];
  const isMentor = mentoredIds.length > 0;
  if (staff.role !== 'superadmin') {
    const subIds = await getSubordinateIds(staff._id);
    staffIds = [...new Set([staff._id, ...subIds, ...mentoredIds].map(String))];
  }

  const ASSIGN_FIELDS = [
    'assignedFamilyDoctor', 'assignedNutritionist', 'assignedSpecialist', 'assignedTcmDoctor',
    'assignedPsychologist', 'assignedRehabSpecialist', 'assignedMedicalAssistant', 'assignedHealthManager',
  ];
  const ROLE_ASSIGN_FIELD = {
    familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist',
    specialist: 'assignedSpecialist', tcmDoctor: 'assignedTcmDoctor',
    psychologist: 'assignedPsychologist', rehabSpecialist: 'assignedRehabSpecialist',
    medicalAssistant: 'assignedMedicalAssistant',
  };

  const assignFilter = {};
  if (staff.role !== 'superadmin') {
    if (isMentor) {
      // 导师模式：团队成员角色各异，凡是团队任一成员挂在任意归属字段上的患者都可见（跨字段 OR）
      assignFilter.$or = ASSIGN_FIELDS.map(f => ({ [f]: { $in: staffIds } }));
    } else {
      // 普通模式：只看自己角色对应的归属字段（healthManager 及未列出角色归入 assignedHealthManager）
      const field = ROLE_ASSIGN_FIELD[staff.role] || 'assignedHealthManager';
      assignFilter[field] = { $in: staffIds };
    }
  }

  const filter = { ...assignFilter };
  if (search) {
    const searchOr = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
    // 导师模式下 assignFilter 已占用 $or（归属过滤），此时用 $and 组合归属与搜索，避免互相覆盖
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    } else {
      filter.$or = searchOr;
    }
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

// GET /api/staff/checkup-progress — 体检方案回传进度总览（避免健管专员逐个客户查询漏检）
// 2026-07-02：健管专员反馈"手上10个客户涉及体检，没有统一界面看谁的报告还没回传，得一个个查"。
// 复用 /patients 同一套角色分配过滤逻辑，找出当前专员名下所有客户，关联查 HealthPlan(年度体检方案)
// 里状态为 pending 的检验/检查/功能医学检测项目，按客户汇总数量，一次性看到全貌。
router.get('/checkup-progress', staffAuth, async (req, res) => {
  try {
    const staff = req.staff;
    let staffIds = [staff._id];
    if (staff.role !== 'superadmin') {
      const subIds = await getSubordinateIds(staff._id);
      staffIds = [staff._id, ...subIds];
    }
    const assignFilter = {};
    if (staff.role !== 'superadmin') {
      if (staff.role === 'familyDoctor') assignFilter.assignedFamilyDoctor = { $in: staffIds };
      else if (staff.role === 'nutritionist') assignFilter.assignedNutritionist = { $in: staffIds };
      else if (staff.role === 'specialist') assignFilter.assignedSpecialist = { $in: staffIds };
      else if (staff.role === 'tcmDoctor') assignFilter.assignedTcmDoctor = { $in: staffIds };
      else if (staff.role === 'psychologist') assignFilter.assignedPsychologist = { $in: staffIds };
      else if (staff.role === 'rehabSpecialist') assignFilter.assignedRehabSpecialist = { $in: staffIds };
      else if (staff.role === 'medicalAssistant') assignFilter.assignedMedicalAssistant = { $in: staffIds };
      else assignFilter.assignedHealthManager = { $in: staffIds };
    }

    const patients = await User.find(assignFilter).select('name phone').lean();
    if (!patients.length) return res.json({ success: true, data: [] });
    const patientIds = patients.map(p => p._id);
    const patientMap = new Map(patients.map(p => [String(p._id), p]));

    const plans = await HealthPlan.find({
      patientId: { $in: patientIds },
      type: 'annual_checkup',
      status: { $ne: 'cancelled' },
    }).select('patientId title items status createdAt').lean();

    const result = [];
    plans.forEach(plan => {
      const pendingItems = (plan.items || []).filter(it =>
        it.status === 'pending' && it.itemType && ['labTest', 'specialExam', 'functionalTest'].includes(it.itemType)
      );
      if (!pendingItems.length) return;
      const patient = patientMap.get(String(plan.patientId));
      if (!patient) return;
      result.push({
        patientId: plan.patientId,
        patientName: patient.name,
        patientPhone: patient.phone,
        planId: plan._id,
        planTitle: plan.title,
        totalItems: (plan.items || []).length,
        pendingCount: pendingItems.length,
        pendingNames: pendingItems.map(it => it.name),
        createdAt: plan.createdAt,
      });
    });
    // 缺项越多越靠前，方便优先跟进
    result.sort((a, b) => b.pendingCount - a.pendingCount);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
router.post('/patients', staffAuth, checkPermission('patients', 'create'), async (req, res) => {
  const staff = req.staff;
  const {
    name, phone, gender, age, height, weight,
    birthDate, idNumber, idType, maritalStatus, ethnicity, belief, memberType,
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
    idType: idType === 'passport' ? 'passport' : 'idCard',
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
router.put('/patients/:id', staffAuth, checkPermission('patients', 'edit'), async (req, res) => {
  const allowed = [
    'name', 'gender', 'age', 'height', 'weight', 'preferredTitle',
    'birthDate', 'memberType', 'belief',
    'chronicDiseases', 'patientType', 'source', 'remark',
    'idNumber', 'idType', 'workplace', 'occupation', 'maritalStatus',
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
router.get('/followups', staffAuth, checkPermission('followups', 'view'), async (req, res) => {
  const { page = 1, limit = 20, status = '', dateFrom = '', dateTo = '', patientName = '', assignedTo = '' } = req.query;

  // 如果按患者姓名搜索，先查出匹配的用户ID
  let patientFilter = {};
  if (patientName) {
    const matchedUsers = await User.find({ name: { $regex: patientName, $options: 'i' } }).select('_id');
    patientFilter = { patientId: { $in: matchedUsers.map(u => u._id) } };
  }

  // 数据权限：随访任务归属实际执行人（assignedTo）；未指定执行人时退回创建人自己。
  // 例外：家庭医生作为患者的第一责任人，需要看到名下患者的全部随访（含健管专员等他人执行的），
  // 用于把控质量，但不代表随访归属改到家庭医生名下——执行人仍是 assignedTo 那个人。
  let ownerFilter;
  if (req.staff.role === 'familyDoctor') {
    const myPatients = await User.find({ assignedFamilyDoctor: req.staff._id }).select('_id');
    const myPatientIds = myPatients.map(p => p._id);
    ownerFilter = { $or: [{ assignedTo: req.staff._id }, { assignedTo: null, staffId: req.staff._id }, { patientId: { $in: myPatientIds } }] };
  } else {
    ownerFilter = { $or: [{ assignedTo: req.staff._id }, { assignedTo: null, staffId: req.staff._id }] };
  }

  const filter = { $and: [ownerFilter, patientFilter, assignedTo ? { assignedTo } : {}] };
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
    { $match: { userId: { $in: patientIds }, ...tenantMatchStage() } },
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
router.post('/followups', staffAuth, checkPermission('followups', 'create'), async (req, res) => {
  const { patientId, date, type, status, content, theme, assignedTo, cancelReason, nextFollowUpDate, tags, vitals, checkInItems, repeatDaily, followUpSchemeId, formData, participants, interviewMinutes } = req.body;
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
    repeatDaily: !!repeatDaily,
    followUpSchemeId: followUpSchemeId || null,
    formData: formData || null,
    participants: participants || '',
    interviewMinutes: interviewMinutes || '',
  });

  await followUp.populate('patientId', 'name phone');
  res.json({ success: true, data: followUp });
});

// ── PUT /api/staff/followups/:id ──────────────────────────────────
router.put('/followups/:id', staffAuth, checkPermission('followups', 'edit'), async (req, res) => {
  // 允许创建人或被分配人更新（各自能改的字段范围不同，见下）
  const followUp = await FollowUp.findOne({
    _id: req.params.id,
    $or: [{ staffId: req.staff._id }, { assignedTo: req.staff._id }],
  });
  if (!followUp) return res.status(404).json({ success: false, message: '随访记录不存在' });

  if (req.body.status === 'cancelled' && !req.body.cancelReason && !followUp.cancelReason) {
    return res.status(400).json({ success: false, message: '取消随访必须填写取消原因' });
  }

  const isSuper = req.staff.role === 'superadmin';
  const isOwner = isSuper || String(followUp.staffId) === String(req.staff._id);
  // 计划层字段（何时、谁负责、要不要做）只有创建人（或超管）能改；执行人只能填写执行结果，
  // 不能擅自改动创建人定下的随访安排——避免执行人绕过创建人调整计划本身
  const OWNER_ONLY = ['date', 'theme', 'type', 'assignedTo', 'nextFollowUpDate', 'tags'];
  // 执行层字段：谁去做都能填，被指派人是实际执行随访的人
  const EXEC_FIELDS = ['status', 'content', 'cancelReason', 'vitals', 'checkInItems', 'participants', 'interviewMinutes'];
  const allowed = isOwner ? [...OWNER_ONLY, ...EXEC_FIELDS] : EXEC_FIELDS;
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

// ── PATCH /api/staff/followups/:id/review ────────────────────────
// 家庭医生审核方案确认后自动生成的随访计划（aiStatus:pending）。approve→正式生效；reject→取消
router.patch('/followups/:id/review', staffAuth, async (req, res) => {
  try {
    const { action, edits } = req.body; // action: approve | reject；edits: 审核时可修改的字段（可选）
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
    const followUp = await FollowUp.findOne({ _id: req.params.id, aiStatus: 'pending' });
    if (!followUp) return res.status(404).json({ success: false, message: '待审核随访计划不存在' });

    if (action === 'reject') {
      followUp.status = 'cancelled';
      followUp.cancelReason = '家庭医生审核未通过';
      followUp.aiStatus = null;
      await followUp.save();
      return res.json({ success: true, message: '已驳回' });
    }

    const EDITABLE = ['date', 'theme', 'type', 'assignedTo', 'content'];
    if (edits && typeof edits === 'object') {
      EDITABLE.forEach(k => { if (edits[k] !== undefined) followUp[k] = edits[k]; });
    }
    followUp.aiStatus = 'approved';
    followUp.staffId = req.staff._id;
    await followUp.save();
    res.json({ success: true, message: '已通过审核', data: followUp });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/staff/followups/:id ──────────────────────────────
// 软删除：状态改为 cancelled，不物理删除
router.delete('/followups/:id', staffAuth, checkPermission('followups', 'delete'), async (req, res) => {
  const query = req.staff.role === 'superadmin' ? { _id: req.params.id } : { _id: req.params.id, staffId: req.staff._id };
  const followUp = await FollowUp.findOne(query);
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
    { $match: { ...myFilter, ...tenantMatchStage(), chronicDiseases: { $exists: true, $ne: [] } } },
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
router.get('/plans', staffAuth, checkPermission('plans', 'view'), async (req, res) => {
  const { patientId, type, status, patientName, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (patientId) filter.patientId = patientId;
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (patientName) {
    const matchedUsers = await User.find({ name: { $regex: patientName, $options: 'i' } }).select('_id');
    filter.patientId = { $in: matchedUsers.map(u => u._id) };
  }
  // 查看权限按"患者归属"而非"创建人"：家庭医生需要看到自己名下患者的全部方案（含营养师生成的营养方案）
  // 才能全面了解患者情况，但只有对应角色能编辑——查看范围和编辑范围是两条独立规则。
  // 2026-07-07 用户反馈："家庭医生看不到客户的营养干预方案，家庭医生要能看到客户的所有信息"
  const ROLE_ASSIGN_FIELD_FOR_PLANS = {
    healthManager: 'assignedHealthManager', familyDoctor: 'assignedFamilyDoctor',
    nutritionist: 'assignedNutritionist', medicalAssistant: 'assignedMedicalAssistant',
    psychologist: 'assignedPsychologist', rehabSpecialist: 'assignedRehabSpecialist',
    tcmDoctor: 'assignedTcmDoctor', specialist: 'assignedSpecialist',
  };
  if (req.staff.role !== 'superadmin') {
    const assignField = ROLE_ASSIGN_FIELD_FOR_PLANS[req.staff.role];
    if (assignField) {
      const myPatients = await User.find({ [assignField]: req.staff._id }).select('_id');
      const myPatientIds = myPatients.map(p => p._id);
      filter.patientId = filter.patientId
        ? { $in: (filter.patientId.$in || [filter.patientId]).filter(id => myPatientIds.some(p => String(p) === String(id))) }
        : { $in: myPatientIds };
    } else {
      filter.staffId = req.staff._id; // 无归属字段的角色（如healthPlanner）退回按创建人过滤
    }
  }
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
router.post('/plans', staffAuth, checkPermission('plans', 'create'), async (req, res) => {
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

// 部分方案类型只归特定角色负责（不论谁生成的），跟"仅制定人可改"是两条独立限制都要满足：
// 年度体检方案/年度管理方案只有家庭医生能编辑/审核，营养干预方案只有营养师——
// 2026-07-07 用户明确规则：家庭医生生成的方案营养师不能删改，反之亦然，按患者角色分工而非单纯创建人
const PLAN_TYPE_OWNER_ROLE = { annual_checkup: 'familyDoctor', nutrition: 'nutritionist' };
function checkPlanTypeRole(plan, staffRole) {
  const requiredRole = PLAN_TYPE_OWNER_ROLE[plan.type];
  if (!requiredRole) return true; // 未限定角色的类型（如医嘱/心理咨询方案）不受此限制
  return staffRole === 'superadmin' || staffRole === requiredRole;
}

// PUT /api/staff/plans/:id — 只有制定人（staffId）或超管可修改，避免他人越权改动方案内容；
// 部分方案类型（年度体检/营养方案）额外要求角色匹配，不论是不是本人生成
router.put('/plans/:id', staffAuth, checkPermission('plans', 'edit'), async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  if (!checkPlanTypeRole(plan, req.staff.role)) {
    return res.status(403).json({ success: false, message: '该类型方案仅限对应角色（家庭医生/营养师）修改' });
  }
  if (req.staff.role !== 'superadmin' && String(plan.staffId) !== String(req.staff._id)) {
    return res.status(403).json({ success: false, message: '仅方案制定人可修改' });
  }
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

// DELETE /api/staff/plans/:id — 只有制定人（staffId）或超管可删除；部分方案类型额外要求角色匹配
router.delete('/plans/:id', staffAuth, checkPermission('plans', 'delete'), async (req, res) => {
  const plan = await HealthPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  if (!checkPlanTypeRole(plan, req.staff.role)) {
    return res.status(403).json({ success: false, message: '该类型方案仅限对应角色（家庭医生/营养师）删除' });
  }
  if (req.staff.role !== 'superadmin' && String(plan.staffId) !== String(req.staff._id)) {
    return res.status(403).json({ success: false, message: '仅方案制定人可删除' });
  }
  await HealthPlan.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '已删除' });
});

// ── 报告管理 ──────────────────────────────────────────────
// GET /api/staff/medical-reports?patientId=&status=
router.get('/medical-reports', staffAuth, checkPermission('reports', 'view'), async (req, res) => {
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
    const { patientId, title, type, hospital, date, fileUrl, fileUrls, content, mimeType, fileSize, planId, planItemId, screeningL1, screeningL2 } = req.body;
    if (!patientId || !title) return res.status(400).json({ success: false, message: '会员和标题不能为空' });
    // fileUrls（一份报告多张照片场景）优先，fileUrl 仍取第一个做兼容，不破坏现有单文件读取逻辑
    const resolvedFileUrls = Array.isArray(fileUrls) && fileUrls.length ? fileUrls : (fileUrl ? [fileUrl] : []);
    const resolvedFileUrl = resolvedFileUrls[0] || '';

    // base64 内容限制（约 7MB 原始文件 → 9.3MB base64）
    if (content && content.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: '文件过大，请压缩后重试（最大约7MB）' });
    }
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'image/webp', 'image/heic', 'image/heif', 'image/bmp'];
    if (mimeType && !ALLOWED_MIME.includes(mimeType)) {
      return res.status(400).json({ success: false, message: `不支持的文件格式（${mimeType}）` });
    }

    // HEIC/HEIF（苹果设备拍照默认格式）转JPEG存储，否则审核弹窗在非Safari设备上看不到原图
    let effectiveContent = content || '';
    let effectiveMimeType = mimeType || '';
    if (content && (mimeType === 'image/heic' || mimeType === 'image/heif')) {
      const { convertHeicBase64IfNeeded } = require('../utils/oss');
      const converted = await convertHeicBase64IfNeeded(content, mimeType);
      effectiveContent = converted.content;
      effectiveMimeType = converted.mimeType;
    }

    const checkDate = date || '';
    const reportYear = checkDate ? new Date(checkDate).getFullYear() : new Date().getFullYear();

    // 如果提供了 screeningL1 + 日期，检查是否已存在"同类筛查但还没有文件"的占位记录（避免上传报告和
    // 手动录入产生两条审核）——2026-07-03修复两处：
    // 1) 原查询只按 screeningL1+checkDate 匹配，没看 screeningL2。一份报告涉及多个类目时，健管专员
    //    同一天、同一大类、但不同子类目分别上传，会被误判成"已存在同一条"，后一份覆盖前一份丢失文件。
    //    补上 screeningL2 一起匹配（子类目不同就不是同一条筛查记录）。
    // 2) 原逻辑只要匹配上就直接覆盖 fileUrl，但即使 L1+L2 都相同，也可能是两份独立的真实报告（如同一
    //    大类同一子类目下，分两次分别拍了报告前后两页）。收紧为：只有已存在记录还没有 fileUrl（即通过
    //    体检方案生成的空壳占位记录，等着补文件）才合并覆盖；已经有文件的必须新建，不能覆盖一份已经
    //    真实存在的报告。
    let report;
    if (screeningL1 && checkDate) {
      const existing = await MedicalReport.findOne({ user: patientId, checkDate, screeningL1, screeningL2: screeningL2 || '', fileUrl: '' });
      if (existing) {
        if (title) existing.title = title;
        if (hospital) existing.hospital = hospital;
        if (resolvedFileUrl) {
          existing.fileUrl = resolvedFileUrl;
          existing.fileUrls = resolvedFileUrls;
          existing.content = effectiveContent;
          existing.mimeType = effectiveMimeType;
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
      fileUrl: resolvedFileUrl, fileUrls: resolvedFileUrls, content: effectiveContent,
      mimeType: effectiveMimeType, fileSize: fileSize || '',
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
    if (hospital !== undefined) { report.hospital = hospital; report.institution = hospital; }
    if (date !== undefined) {
      report.date = date; report.checkDate = date;
      // 2026-07-09修复"同一检查同时出现在2025和2026"：编辑改了检查日期时，reportYear 必须跟着日期重算，
      // 否则会出现 checkDate=2025-08-06 但 reportYear 仍停留在旧值2026 的错位，导致这份报告在两个年度里都出现。
      // 若前端本次同时显式传了 reportYear（见下方），以显式值为准；否则一律按新日期推导。
      if (reportYear === undefined && date) {
        const y = new Date(date).getFullYear();
        if (!isNaN(y)) report.reportYear = y;
      }
    }
    if (note !== undefined) report.note = note;
    // AI 审核字段
    if (aiStatus !== undefined) { report.aiStatus = aiStatus; report.reviewedAt = new Date(); report.reviewedByStaff = req.staff._id; }
    if (screeningCategory !== undefined) report.screeningCategory = screeningCategory;
    if (reportYear !== undefined) report.reportYear = reportYear;
    if (reportItems !== undefined) {
      // 2026-07-09修复金娟"超声提取混乱/保存不成功"：AI解析超声等影像报告时常产生 name 与所有内容字段
      // (value/findings/diagnosis/conclusion) 全空的空壳项（金娟2023-05-16超声7项里有5项是空壳），
      // 既让页面显示混乱，又污染专项筛查。保存时统一剔除这类完全空白的项，保留至少有名称或有任一内容的项。
      const _blank = (v) => String(v == null ? '' : v).trim() === '';
      report.reportItems = (Array.isArray(reportItems) ? reportItems : []).filter(it => {
        if (!it || typeof it !== 'object') return false;
        return !(_blank(it.name) && _blank(it.value) && _blank(it.findings) && _blank(it.diagnosis) && _blank(it.conclusion));
      });
    }
    if (aiSummary !== undefined) report.aiSummary = aiSummary;
    // 补传/替换文件
    if (content !== undefined) {
      if (content && content.length > 10 * 1024 * 1024) return res.status(400).json({ success: false, message: '文件过大，最大约7MB' });
      report.content = content;
    }
    if (mimeType !== undefined) report.mimeType = mimeType;
    if (fileSize !== undefined) report.fileSize = fileSize;
    await report.save();

    // 2026-07-02修复：此前条件是 || 关系，"保存草稿"(aiStatus:'pending')只要带了reportItems字段
    // 也会触发同步，导致专项筛查在审核通过前就被写入。改成严格要求 aiStatus 变为 reviewed 才同步，
    // 跟前端"提交审核（写入专项筛查）"按钮的文案设计意图一致——只有审核通过后才应该出现在专项筛查。
    if (aiStatus === 'reviewed' && report.user) {
      await syncScreeningItems(report.user, report._id, report.reportItems);
    }

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/staff/medical-reports/:id — 删除报告（审核前可删）
router.delete('/medical-reports/:id', staffAuth, checkPermission('reports', 'delete'), async (req, res) => {
  try {
    const report = await MedicalReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
    if (report.audit_status === 'audited') return res.status(403).json({ success: false, message: '已审核通过的报告不可删除' });
    await report.deleteOne();
    // 级联清理：UserScreeningItem 里 reportId 指向这份报告的记录也要一并删除，
    // 否则报告本体没了但专项筛查索引还留着，页面上会出现一条内容空白、无法展开的孤儿记录
    // （2026-07-03 潘孝银"心脏超声"重复上传后删除旧报告，残留孤儿记录复现过一次）
    await UserScreeningItem.deleteMany({ reportId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/medical-reports/:id/audit — 审核报告
router.patch('/medical-reports/:id/audit', staffAuth, checkPermission('reports', 'audit'), async (req, res) => {
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
// 返回相对路径而非绝对URL——写死 http://121.40.156.39 会在 https 页面下被浏览器 Mixed Content
// 策略拦截（HTTPS页面不允许加载HTTP资源），前端自行拼接当前协议+域名。
router.post('/upload/image', staffAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '未收到文件' });
  const url = `/api/uploads/${req.file.filename}`;
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
router.get('/knowledge', staffAuth, checkPermission('knowledge', 'view'), async (req, res) => {
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
router.post('/knowledge', staffAuth, checkPermission('knowledge', 'send'), async (req, res) => {
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
router.delete('/knowledge/:id', staffAuth, checkPermission('knowledge', 'send'), async (req, res) => {
  await KnowledgeItem.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '已删除' });
});

// POST /api/staff/knowledge/:id/push — 推送给会员
router.post('/knowledge/:id/push', staffAuth, checkPermission('knowledge', 'send'), async (req, res) => {
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
router.get('/questionnaires', staffAuth, checkPermission('questionnaires', 'view'), async (req, res) => {
  const qs = await DynamicQuestionnaire.find({ deletedAt: null }).select('title description status questions deadline createdAt').sort({ createdAt: -1 });
  res.json({ success: true, data: qs });
});

// POST /api/staff/questionnaires/:id/push — 推送问卷给会员
router.post('/questionnaires/:id/push', staffAuth, checkPermission('questionnaires', 'send'), async (req, res) => {
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
router.get('/questionnaires/:id/responses', staffAuth, checkPermission('questionnaires', 'view'), async (req, res) => {
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
router.get('/service-records', staffAuth, checkPermission('service_records', 'view'), async (req, res) => {
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
router.post('/service-records', staffAuth, checkPermission('service_records', 'create'), async (req, res) => {
  const { patientId, type, date, title, content, result, nextDate, diseaseName, medicalEscort, tcmRecord, specialistRecord } = req.body;
  if (!patientId || !type) return res.status(400).json({ success: false, message: '会员和类型不能为空' });
  const record = await ServiceRecord.create({
    staffId: req.staff._id, patientId, type,
    date: date ? new Date(date) : new Date(),
    title: title || '', content: content || '', result: result || '',
    nextDate: nextDate ? new Date(nextDate) : null,
    diseaseName: diseaseName || '',
    medicalEscort: medicalEscort || {}, tcmRecord: tcmRecord || {}, specialistRecord: specialistRecord || {},
  });
  await record.populate('patientId', 'name phone');
  res.json({ success: true, data: record });
});

// PUT /api/staff/service-records/:id
router.put('/service-records/:id', staffAuth, checkPermission('service_records', 'edit'), async (req, res) => {
  const record = await ServiceRecord.findOne({ _id: req.params.id, staffId: req.staff._id });
  if (!record) return res.status(404).json({ success: false, message: '记录不存在' });
  const allowed = ['date', 'title', 'content', 'result', 'nextDate', 'diseaseName', 'medicalEscort', 'tcmRecord', 'specialistRecord'];
  allowed.forEach(k => { if (req.body[k] !== undefined) record[k] = req.body[k]; });
  await record.save();
  res.json({ success: true, data: record });
});

// POST /api/staff/service-records/:id/supplement — 追加补充记录
router.post('/service-records/:id/supplement', staffAuth, checkPermission('service_records', 'edit'), async (req, res) => {
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
router.put('/service-records/:id/supplement/:suppId', staffAuth, checkPermission('service_records', 'edit'), async (req, res) => {
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
router.delete('/service-records/:id/supplement/:suppId', staffAuth, checkPermission('service_records', 'delete'), async (req, res) => {
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
router.delete('/service-records/:id', staffAuth, checkPermission('service_records', 'delete'), async (req, res) => {
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
      { $match: { staffId: req.staff._id, status: { $in: ['confirmed', 'paid'] }, ...tenantMatchStage() } },
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
    { $match: tenantMatchStage() },
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
// 营收统计基于真实支付确认(paymentStatus:'paid')，不是订单状态(status)——订单状态只代表服务流程，不代表是否真的收到钱
router.get('/operations/dashboard', staffAuth, async (req, res) => {
  const OPS_ROLES = ['superadmin', 'manager'];
  if (!OPS_ROLES.includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '无运营权限' });
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const [
    totalPatients, todayNew, monthNew,
    diseaseAgg, revenueAgg, revenueByProduct,
    commissionAgg, teamCommissionAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: today } }),
    User.countDocuments({ createdAt: { $gte: monthStart } }),
    User.aggregate([
      { $match: { ...tenantMatchStage(), chronicDiseases: { $exists: true, $ne: [] } } },
      { $unwind: '$chronicDiseases' },
      { $group: { _id: '$chronicDiseases', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 },
    ]),
    // 真实营收总览：只统计已确认支付的订单
    Order.aggregate([
      { $match: { paymentStatus: 'paid', ...tenantMatchStage() } },
      { $group: {
        _id: null,
        total: { $sum: '$paidAmount' },
        thisMonth: { $sum: { $cond: [{ $gte: ['$paidAt', monthStart] }, '$paidAmount', 0] } },
        count: { $sum: 1 },
      }},
    ]),
    // 各服务品类营收占比（按 orderType 分组：service/package/product）
    Order.aggregate([
      { $match: { paymentStatus: 'paid', ...tenantMatchStage() } },
      { $group: { _id: '$orderType', total: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    // 佣金结算总览（按状态汇总，反映待审核/待打款/已打款规模）
    Commission.aggregate([
      { $match: tenantMatchStage() },
      { $group: { _id: '$status', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    // 团队绩效排名（按员工+角色汇总，区分转介绍/服务两条业绩线）
    Commission.aggregate([
      { $match: { ...tenantMatchStage(), status: { $ne: 'cancelled' } } },
      { $group: {
        _id: { staffId: '$staffId', role: '$role' },
        totalAmount: { $sum: '$commissionAmount' },
        orderCount: { $sum: 1 },
      }},
      { $sort: { totalAmount: -1 } },
      { $limit: 20 },
    ]),
  ]);

  await Admin.populate(teamCommissionAgg, { path: '_id.staffId', select: 'name role title' });

  const commissionByStatus = { pending: 0, confirmed: 0, paid: 0, cancelled: 0 };
  const commissionCountByStatus = { pending: 0, confirmed: 0, paid: 0, cancelled: 0 };
  commissionAgg.forEach(c => { commissionByStatus[c._id] = c.total; commissionCountByStatus[c._id] = c.count; });

  res.json({
    success: true,
    data: {
      patients: { total: totalPatients, todayNew, monthNew },
      diseaseDistribution: diseaseAgg.map(d => ({ disease: d._id, count: d.count })),
      revenue: {
        total: revenueAgg[0]?.total || 0,
        thisMonth: revenueAgg[0]?.thisMonth || 0,
        orderCount: revenueAgg[0]?.count || 0,
      },
      revenueByCategory: revenueByProduct.map(r => ({ orderType: r._id, total: r.total, count: r.count })),
      commissionOverview: {
        pendingAmount: commissionByStatus.pending, pendingCount: commissionCountByStatus.pending,
        confirmedAmount: commissionByStatus.confirmed, confirmedCount: commissionCountByStatus.confirmed,
        paidAmount: commissionByStatus.paid, paidCount: commissionCountByStatus.paid,
      },
      teamPerformance: teamCommissionAgg.map(t => ({
        staffId: t._id.staffId?._id, staffName: t._id.staffId?.name || '未知', staffRole: t._id.staffId?.role,
        role: t._id.role, totalAmount: t.totalAmount, orderCount: t.orderCount,
      })),
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
router.get('/products', staffAuth, checkPermission('products', 'view'), async (req, res) => {
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
    servicePerformerRoles: p.servicePerformerRoles || [],
  }));
  res.json({ success: true, data: { products: list } });
});

// POST /api/staff/products/push-bundle — 推送多产品组合给会员
router.post('/products/push-bundle', staffAuth, checkPermission('products', 'send'), async (req, res) => {
  const { productIds, patientIds, pricedProducts, servicePerformers } = req.body;
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
    images: p.images || [], servicePrices: p.servicePrices || [],
  }));
  const totalPrice = productItems.reduce((sum, p) => sum + p.price, 0);
  const title = products.length === 1 ? products[0].name : `产品推荐（${products.length}项）`;
  const content = productItems.map(p => `${p.name} ¥${p.price}`).join('、');
  // 清洗推送时指定的各岗位服务人（[{productId, role, staffId}]）
  const cleanPerformers = Array.isArray(servicePerformers)
    ? servicePerformers.filter(sp => sp && sp.role && sp.staffId)
        .map(sp => ({ productId: sp.productId || null, role: sp.role, staffId: sp.staffId }))
    : [];
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'product', title, content,
    price: totalPrice,
    productId: products.length === 1 ? products[0]._id.toString() : null,
    products: productItems,
    servicePerformers: cleanPerformers,
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位会员` });
});

// POST /api/staff/products/:id/push — 推送产品给会员（兼容旧版）
router.post('/products/:id/push', staffAuth, checkPermission('products', 'send'), async (req, res) => {
  const { patientIds, servicePerformers } = req.body;
  if (!patientIds?.length) return res.status(400).json({ success: false, message: '请选择会员' });
  const product = await Product.findById(req.params.id).catch(() => null);
  if (!product) return res.status(404).json({ success: false, message: '产品不存在' });
  const cleanPerformers = Array.isArray(servicePerformers)
    ? servicePerformers.filter(sp => sp && sp.role && sp.staffId)
        .map(sp => ({ productId: product._id.toString(), role: sp.role, staffId: sp.staffId }))
    : [];
  const records = patientIds.map(pid => ({
    staffId: req.staff._id, patientId: pid,
    type: 'product',
    title: product.name,
    content: product.subtitle || '',
    price: product.originalPrice || null,
    productId: product._id.toString(),
    servicePerformers: cleanPerformers,
  }));
  await PushRecord.insertMany(records);
  res.json({ success: true, message: `已推送给 ${patientIds.length} 位会员` });
});

// ── 团队管理 ───────────────────────────────────────────────
// GET /api/staff/team — 获取团队成员列表（可见下级）
router.get('/team', staffAuth, checkPermission('team', 'view'), async (req, res) => {
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

// GET /api/staff/requisition-items — 获取可开单的项目列表（检验医嘱 + 检查医嘱 + 功能医学检测 + 套餐）
// 2026-07-02：补充功能医学检测这一类，此前体检方案设计/开单只能选检验医嘱和检查医嘱，
// 跟 admin 后台"功能医学检测"页面配置好的项目完全不通，这里补齐第三类，跟前两类同构处理。
router.get('/requisition-items', staffAuth, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const [labOrders, specialExams, functionalTests, packages] = await Promise.all([
      LabTestOrder.find({ ...filter, status: 'active' }).select('name mnemonic items').limit(50),
      SpecialExam.find({ ...filter, status: 'active', deleted: { $ne: true } }).select('name mnemonic examType').limit(50),
      FunctionalMedicineTest.find({ ...filter, status: 'active', deleted: { $ne: true } }).select('name testResult indicatorAnalysis').limit(50),
      LabTestPackage.find({ ...filter, status: 'active' }).select('name mnemonic labTestItems').limit(50),
    ]);
    const result = [
      ...packages.map(p => ({ _id: p._id, name: p.name, mnemonic: p.mnemonic, type: 'labTestPackage', typeName: '套餐', itemCount: p.labTestItems?.length || 0 })),
      ...labOrders.map(o => ({ _id: o._id, name: o.name, mnemonic: o.mnemonic, type: 'labTestOrder', typeName: '检验医嘱' })),
      ...specialExams.map(e => ({ _id: e._id, name: e.name, mnemonic: e.mnemonic, type: 'specialExam', typeName: '检查医嘱', description: e.description || '', conclusion: e.conclusion || '' })),
      ...functionalTests.map(f => ({ _id: f._id, name: f.name, mnemonic: '', type: 'functionalTest', typeName: '功能医学检测', description: f.testResult || '', conclusion: f.indicatorAnalysis || '' })),
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
      // 2026-07-02修复：此前只 populate 了 labTestItems，套餐里挂在 orders(检验医嘱) 下的子项目
      // （如"肾功能5项"医嘱下的胱抑素C等）、specialExams(检查医嘱) 会被漏掉，预填时这些项目直接丢失。
      // 补全另外两类关联，跟 /screening-tree 读取套餐内容的方式保持一致。
      const pkg = await LabTestPackage.findById(id)
        .populate({ path: 'orders', select: 'name items', populate: { path: 'items', select: 'name unit referenceValue referenceRange' } })
        .populate('labTestItems', 'name unit referenceValue referenceRange')
        .populate({ path: 'specialExams', match: { deleted: { $ne: true } }, select: 'name referenceRange' });
      const seen = new Set();
      const pushItem = (name, unit, referenceRange) => {
        if (!name || seen.has(name)) return;
        seen.add(name);
        items.push({ name, value: '', unit: unit || '', referenceRange: referenceRange || '', status: 'normal' });
      };
      (pkg?.orders || []).forEach(o => (o.items || []).forEach(i => pushItem(i.name, i.unit, i.referenceRange || i.referenceValue)));
      (pkg?.labTestItems || []).forEach(i => pushItem(i.name, i.unit, i.referenceRange || i.referenceValue));
      (pkg?.specialExams || []).forEach(e => pushItem(e.name, '', e.referenceRange));
    } else if (type === 'labTestOrder') {
      const order = await LabTestOrder.findById(id).populate('items', 'name unit referenceValue referenceRange');
      items = (order?.items || []).map(i => ({
        name: i.name,
        value: '',
        unit: i.unit || '',
        referenceRange: i.referenceRange || i.referenceValue || '',
        status: 'normal',
      }));
    } else if (type === 'functionalTest') {
      // 功能医学检测本身没有子指标结构（不像检验医嘱下面还挂着多个子项目），预填这一条项目本身即可
      const test = await FunctionalMedicineTest.findById(id).select('name');
      if (test) items = [{ name: test.name, value: '', unit: '', referenceRange: '', status: 'normal' }];
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

// 心理健康评估已改为走问卷库（Epworth/SCL90/SDS/SAS，questionnaire.js /:id/submit 自动写入 User.psychAssessments）
// 原医护端代填 PHQ-9/GAD-7 的路由已废弃，历史数据保留在 PsychAssessment 集合中不删除，仅不再提供新增/查询/删除入口

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

// ── 优惠券（商城下单抵用，健管/超管手动发放） ───────────────────
// POST /api/staff/patients/:id/coupons
router.post('/patients/:id/coupons', staffAuth, async (req, res) => {
  const { type, value, title, minSpend, validTo, remark } = req.body;
  if (!type || !value) return res.status(400).json({ success: false, message: '券类型和面额不能为空' });
  if (type === 'percent' && (value <= 0 || value >= 100)) {
    return res.status(400).json({ success: false, message: '折扣值需在 0-100 之间（如 90 表示 9 折）' });
  }
  const coupon = await Coupon.create({
    patientId: req.params.id,
    staffId:   req.staff._id,
    type, value,
    title:     title || (type === 'amount' ? `¥${value} 抵用券` : `${value / 10}折优惠券`),
    minSpend:  minSpend || 0,
    validTo:   validTo ? new Date(validTo) : null,
    remark:    remark || '',
  });
  res.json({ success: true, data: coupon });
});

// GET /api/staff/patients/:id/coupons
router.get('/patients/:id/coupons', staffAuth, async (req, res) => {
  const coupons = await Coupon.find({ patientId: req.params.id })
    .sort({ createdAt: -1 })
    .populate('staffId', 'name role');
  res.json({ success: true, data: coupons });
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

// POST /api/staff/referrals/:id/ai-response-draft — AI辅助生成会诊回复草稿（问题分析+会诊意见），接收方人工审核后再提交
router.post('/referrals/:id/ai-response-draft', staffAuth, async (req, res) => {
  try {
    const referral = await Referral.findOne({ _id: req.params.id, toStaffId: req.staff._id })
      .populate('patientId', 'name gender age chronicDiseases healthProfile labValues')
      .populate('fromStaffId', 'name role title');
    if (!referral) return res.status(404).json({ success: false, message: '转介记录不存在或无权操作' });

    const user = referral.patientId;
    const { chat } = require('../utils/ai');
    const meds = await Medication.find({ user: user._id, stopped: false, aiStatus: { $ne: 'pending' } })
      .select('name dosage').limit(5).lean();

    // 接收人填写的简要概要（可选）——有则让AI围绕它展开成完整回复草稿
    const summary = (req.body?.summary || '').trim();
    const summaryBlock = summary
      ? `\n【接收医师填写的处理概要（请以此为核心，扩写成专业、完整的会诊回复）】\n${summary}\n`
      : '';

    const prompt = `你是一位专业医师，收到同事的会诊转介请求，请根据以下信息草拟你的会诊回复。${summary ? '重点：接收医师已给出处理概要，请忠实围绕该概要扩写，不要偏离或臆造其未提及的诊疗结论。' : ''}

【患者】${user.name}，${user.gender || ''}，${user.age || '?'}岁
【主要诊断/慢病】${(user.chronicDiseases || []).join('、') || '无'}
【当前主要用药】${meds.length ? meds.map(m => `${m.name} ${m.dosage}`).join('；') : '无'}
【药物过敏】${user.healthProfile?.drugAllergy || '无'}
【发起方】${referral.fromStaffId?.name || ''}（${referral.fromStaffId?.role || ''}）
【转介原因】${referral.reason}
【转介详细说明】${referral.content || '无'}${summaryBlock}
请分两行输出：
问题分析：（对患者当前问题的分析评估，60字内）
会诊意见：（会诊结论、后续建议、转归方向，80字内）`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 400 });
    const analysisMatch = text.match(/问题分析[：:]\s*(.+)/);
    const opinionMatch = text.match(/会诊意见[：:]\s*([\s\S]+)/);
    res.json({
      success: true,
      data: {
        responseAnalysis: analysisMatch ? analysisMatch[1].trim() : '',
        responseOpinion: opinionMatch ? opinionMatch[1].trim().slice(0, 300) : '',
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
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

  // 按角色过滤：我负责的患者 + 我这个角色对应的留言频道，统计未读用户留言数（用于侧边栏红点）
  const msgPatientFilter =
    staff.role === 'superadmin'      ? {} :
    staff.role === 'familyDoctor'    ? { assignedFamilyDoctor: staff._id } :
    staff.role === 'nutritionist'    ? { assignedNutritionist: staff._id } :
    staff.role === 'healthManager' || staff.role === 'medicalAssistant'
                                     ? { assignedHealthManager: staff._id } :
                                       { $or: [ { assignedFamilyDoctor: staff._id }, { assignedHealthManager: staff._id }, { assignedNutritionist: staff._id } ] };
  const msgRecipientFilter =
    staff.role === 'familyDoctor'  ? { recipient: { $in: ['doctor', null, undefined] } } :
    staff.role === 'nutritionist'  ? { recipient: 'nutritionist' } :
    {};

  const [recentPushes, pendingReferrals, expiringPatients, unreadReferralCount, unreadRepliedCount, myMsgPatients] = await Promise.all([
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
    // 我负责的患者（用于统计未读留言）
    User.find(msgPatientFilter).select('_id').lean(),
  ]);

  // 未读用户留言数（读消息后即时下降，反映到侧边栏红点）
  const unreadMessageCount = await Message.countDocuments({
    user: { $in: myMsgPatients.map(p => p._id) },
    type: 'user',
    staffReadAt: null,
    ...msgRecipientFilter,
  });

  res.json({
    success: true,
    data: {
      recentPushes,
      pendingReferrals,
      expiringPatients,
      unreadReferralCount,
      unreadRepliedCount,
      unreadMessageCount,
      summary: {
        pushCount: recentPushes.length,
        pendingReferralCount: unreadReferralCount,
        unreadRepliedCount,
        unreadMessageCount,
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
router.get('/marketing/levels', staffAuth, checkPermission('marketing', 'view'), async (req, res) => {
  const levels = await MemberLevel.find().sort({ sortOrder: 1, minPoints: 1 });
  res.json({ success: true, data: levels });
});
router.post('/marketing/levels', staffAuth, checkPermission('marketing', 'create'), async (req, res) => {
  const { name, minPoints, color, benefits, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '等级名称不能为空' });
  const level = await MemberLevel.create({ name, minPoints: minPoints || 0, color: color || '#8AA89C', benefits: benefits || [], sortOrder: sortOrder || 0 });
  res.json({ success: true, data: level });
});
router.put('/marketing/levels/:id', staffAuth, checkPermission('marketing', 'edit'), async (req, res) => {
  const level = await MemberLevel.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!level) return res.status(404).json({ success: false, message: '等级不存在' });
  res.json({ success: true, data: level });
});
router.delete('/marketing/levels/:id', staffAuth, checkPermission('marketing', 'delete'), async (req, res) => {
  await MemberLevel.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 活动管理 ────────────────────────────────────────────
router.get('/marketing/activities', staffAuth, checkPermission('marketing', 'view'), async (req, res) => {
  const { isActive } = req.query;
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  const activities = await Activity.find(filter).sort({ createdAt: -1 }).populate('createdBy', 'name');
  res.json({ success: true, data: activities });
});
router.post('/marketing/activities', staffAuth, checkPermission('marketing', 'create'), async (req, res) => {
  if (!req.body.title) return res.status(400).json({ success: false, message: '活动名称不能为空' });
  const activity = await Activity.create({ ...req.body, createdBy: req.staff._id });
  res.json({ success: true, data: activity });
});
router.put('/marketing/activities/:id', staffAuth, checkPermission('marketing', 'edit'), async (req, res) => {
  const activity = await Activity.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!activity) return res.status(404).json({ success: false, message: '活动不存在' });
  res.json({ success: true, data: activity });
});
router.delete('/marketing/activities/:id', staffAuth, checkPermission('marketing', 'delete'), async (req, res) => {
  await Activity.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 次卡套餐 ────────────────────────────────────────────
router.get('/marketing/packages', staffAuth, checkPermission('marketing', 'view'), async (req, res) => {
  const packages = await SessionPackage.find().sort({ createdAt: -1 }).populate('createdBy', 'name');
  res.json({ success: true, data: packages });
});
router.post('/marketing/packages', staffAuth, checkPermission('marketing', 'create'), async (req, res) => {
  const { name, count, price } = req.body;
  if (!name || !count || !price) return res.status(400).json({ success: false, message: '名称、次数、价格不能为空' });
  const pkg = await SessionPackage.create({ ...req.body, createdBy: req.staff._id });
  res.json({ success: true, data: pkg });
});
router.put('/marketing/packages/:id', staffAuth, checkPermission('marketing', 'edit'), async (req, res) => {
  const pkg = await SessionPackage.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!pkg) return res.status(404).json({ success: false, message: '套餐不存在' });
  res.json({ success: true, data: pkg });
});
router.delete('/marketing/packages/:id', staffAuth, checkPermission('marketing', 'delete'), async (req, res) => {
  await SessionPackage.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ── 异常复查模块 ─────────────────────────────────────────────────────
// GET /api/staff/abnormal-reviews
router.get('/abnormal-reviews', staffAuth, checkPermission('abnormal_review', 'view'), async (req, res) => {
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
router.post('/abnormal-reviews', staffAuth, checkPermission('abnormal_review', 'create'), async (req, res) => {
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
router.patch('/abnormal-reviews/:id', staffAuth, checkPermission('abnormal_review', 'edit'), async (req, res) => {
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
router.delete('/abnormal-reviews/:id', staffAuth, checkPermission('abnormal_review', 'delete'), async (req, res) => {
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
    const { patientName } = req.query;
    const filter = { year };
    if (patientName) {
      const matchedUsers = await User.find({ name: { $regex: patientName, $options: 'i' } }).select('_id');
      filter.patientId = { $in: matchedUsers.map(u => u._id) };
    }
    const plans = await AnnualPlan.find(filter)
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

// 年度管理方案：只有家庭医生/超管可生成和编辑（2026-07-07 用户明确规则：年度管理方案和年度体检方案
// 只由家庭医生负责，营养师等其他角色不应有生成/编辑权限，此前任何登录角色都能操作）
router.put('/patients/:id/annual-plan', staffAuth, async (req, res) => {
  if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '仅家庭医生可生成/编辑年度管理方案' });
  }
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
    // 保存方案的同时按模块内容同步生成随访占位（就医/会诊/复查/接种/检测各条记录直接生成，
    // 日常监测/季度评估按周期批量排期），不用等客户在app端确认才生成。
    const { syncAnnualPlanFollowUps } = require('../utils/annualPlanFollowUps');
    const followUpCount = await syncAnnualPlanFollowUps(plan).catch(() => 0);
    res.json({ success: true, data: plan, followUpCount });
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
      .limit(30)
      .populate('referrerId', 'name role')
      .populate('fulfillerId', 'name role');
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PATCH /api/staff/orders/:id/fulfiller ────────────────────────
// 指定服务人（谁服务谁获得服务费）：只有该订单的推荐人(referrerId)本人或超管可指定——
// 2026-07-07 用户明确规则："推送的时候自动就定了(谁推送谁获推广费)，由推广的人员直接定"服务人，
// 超管只负责在后台配置不同岗位的分佣比例，不参与具体每一单归属指定这类业务操作。
// 没有指定服务人时，settleOrderCommission 只会生成 referrer 一条记录（"没有服务的，就只产生推广费"）。
router.patch('/orders/:id/fulfiller', staffAuth, async (req, res) => {
  try {
    const { fulfillerId } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (req.staff.role !== 'superadmin' && String(order.referrerId) !== String(req.staff._id)) {
      return res.status(403).json({ success: false, message: '仅该订单的推荐人可指定服务人' });
    }
    order.fulfillerId = fulfillerId || null;
    await order.save();
    res.json({ success: true, data: order, message: '服务人已设置' });
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
// 停用不等于删除：停用后记录仍应在列表可见（标"已停用"，可恢复），此前用 active:true 过滤导致
// 停用后从列表消失、跟真删除没区别——医护端无法找回来查看或恢复。改为返回全部，前端按 stopped 标注状态。
router.get('/patients/:id/medications', staffAuth, async (req, res) => {
  try {
    const meds = await Medication.find({ user: req.params.id }).sort({ createdAt: -1 });
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

// 仅记录创建人（staffId）或超管可修改/停用，避免他人越权改动其他医护录入的用药记录
router.patch('/patients/:id/medications/:medId', staffAuth, async (req, res) => {
  try {
    const med = await Medication.findOne({ _id: req.params.medId, user: req.params.id });
    if (!med) return res.status(404).json({ success: false, message: '记录不存在' });
    if (req.staff.role !== 'superadmin' && String(med.staffId) !== String(req.staff._id)) {
      return res.status(403).json({ success: false, message: '仅记录创建人可修改' });
    }
    Object.assign(med, req.body);
    await med.save();
    res.json({ success: true, data: med });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 真正的物理删除（此前这里只是设 active=false，跟"停用"按钮效果重复，名为删除实际不可用；
// 删除是不可逆操作，需先与客户确认，前端已加强提示）
router.delete('/patients/:id/medications/:medId', staffAuth, async (req, res) => {
  try {
    const med = await Medication.findOne({ _id: req.params.medId, user: req.params.id });
    if (!med) return res.status(404).json({ success: false, message: '记录不存在' });
    if (req.staff.role !== 'superadmin' && String(med.staffId) !== String(req.staff._id)) {
      return res.status(403).json({ success: false, message: '仅记录创建人可删除' });
    }
    await med.deleteOne();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 患者营养素管理（医护端 CRUD）──────────────────────────────────
// 停用不等于删除：停用后记录仍应在列表可见（标"已停用"，可恢复），此前用 stopped:false 过滤导致
// 停用后从列表消失、跟真删除没区别——医护端无法找回来查看或恢复。改为返回全部，前端按 stopped 标注状态。
router.get('/patients/:id/supplements', staffAuth, async (req, res) => {
  try {
    const sups = await Supplement.find({ user: req.params.id }).sort({ createdAt: -1 });
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

// 仅记录创建人（staffId）或超管可修改/停用，避免他人越权改动其他医护录入的营养素记录
router.patch('/patients/:id/supplements/:supId', staffAuth, async (req, res) => {
  try {
    const sup = await Supplement.findOne({ _id: req.params.supId, user: req.params.id });
    if (!sup) return res.status(404).json({ success: false, message: '记录不存在' });
    if (req.staff.role !== 'superadmin' && String(sup.staffId) !== String(req.staff._id)) {
      return res.status(403).json({ success: false, message: '仅记录创建人可修改' });
    }
    Object.assign(sup, req.body);
    await sup.save();
    res.json({ success: true, data: sup });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// 真正的物理删除（此前这里只是又设了一次 stopped=true，跟"停用"按钮效果重复，
// 名为删除实际不可用；删除是不可逆操作，需先与客户确认，前端已加强提示）
router.delete('/patients/:id/supplements/:supId', staffAuth, async (req, res) => {
  try {
    const sup = await Supplement.findOne({ _id: req.params.supId, user: req.params.id });
    if (!sup) return res.status(404).json({ success: false, message: '记录不存在' });
    if (req.staff.role !== 'superadmin' && String(sup.staffId) !== String(req.staff._id)) {
      return res.status(403).json({ success: false, message: '仅记录创建人可删除' });
    }
    await sup.deleteOne();
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
    // 2026-07-02修复：此前用 .find() 只取第一条匹配的 reportItem，但一个 itemId(如"肝功能")
    // 在报告里对应的是一整个检验单的多个子项(总蛋白/球蛋白/转氨酶...)，全局只在 UserScreeningItem
    // 存一条归类记录（{user,itemId}唯一），并不代表报告里只有一条数据——.find() 会把同key下除第一条外
    // 的所有子项全部丢弃，导致血脂全套只剩总胆固醇、肝功能只剩总蛋白、血常规/抗核抗体谱等大量漏项。
    // 改为 .filter() 取出全部匹配子项，放进 matchedItems 数组，前端按数组逐条渲染（原有虚拟记录
    // 结构本身就是数组 push，天然支持多条，不需要改前端展示逻辑）。仍保留 obj.value 等单值字段
    // （取第一条作兼容），避免其他还在读单值字段的地方直接报错。
    const enriched = items.map(item => {
      const obj = item.toObject();
      const report = obj.reportId;
      if (report) {
        obj.reportTitle = report.title || '';
        // 在该报告的 reportItems 里找所有 screeningKey 匹配的条目（一个itemId可能对应多个子项）
        // 2026-07-09：单值 screeningKey 是医护审核确认后的权威归类，screeningKeys 数组可能残留审核前
        // AI 二次匹配的过期值。两者都参与反查(itemId 命中任一即算该子项属于此节点)，保证人工改过的归类
        // 能正确把报告子项挂到对应筛查节点下，不再出现"改了归类但报告数据显示不出来/挂到错节点"。
        const matchedItems = (report.reportItems || []).filter(ri =>
          (ri.screeningKeys && ri.screeningKeys.includes(obj.itemId)) ||
          ri.screeningKey === obj.itemId
        );
        obj.matchedItems = matchedItems;
        const matched = matchedItems[0];
        // 2026-07-09修复日期/机构错乱：单条检查项(如妇科阴道超声2025-08-06)可能被并进一份跨年度的
        // 汇总报告(如2026年度体检)里，它有自己的 examDate/institution。此前只取报告级 checkDate/institution，
        // 导致2025年的检查被显示成2026年、机构显示成整份报告的体检机构名。改为优先取 item 级真实日期/机构，
        // 仅在 item 级为空时才回退报告级，从根本上消除"时间归错年、机构归错家"。
        obj.checkDate = (matched && matched.examDate) || report.checkDate || '';
        // 2026-07-09修复机构名错乱：report.institution 多来自 AI OCR（常残缺/是社区名/带识别乱码），
        // report.hospital 才是医护上传时手动录入的规范机构名。此前只读 institution，导致展示的机构跟
        // 医护实际录入的不符。改为「人工录入(hospital)优先 → item级 → 报告级 institution 兜底」，
        // 与用户诉求"以人工录入/确认为准，不要用 AI 自动值覆盖"一致。
        obj.institution = report.hospital || (matched && matched.institution) || report.institution || '';
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
    // 前端对没有reportId的记录用字面量"unknown"占位分组（见PatientDetailPage.jsx中
    // `String(it.reportId || 'unknown')`），"unknown"不是合法ObjectId，直接透传给Mongoose
    // 会抛CastError导致500、记录删不掉——这里识别出这个占位值，按reportId真正为null/不存在处理
    if (reportId && reportId !== 'unknown') q.reportId = reportId;
    else if (reportId === 'unknown') q.reportId = { $in: [null, undefined] };
    if (itemLabel) q.itemLabel = itemLabel;
    const result = await UserScreeningItem.deleteMany(q);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/screening/dedup — 去重：同一 itemId+reportId 保留最新一条（updatedAt最大）
// 2026-07-02修复：去重维度改为 itemId+reportId（而非单独 itemId），避免把不同年份报告产生的
// 同一 itemId 记录当成"重复"删掉——那是需要保留的多年数据，只清理同一份报告内意外重复写入的真重复。
router.post('/patients/:id/screening/dedup', staffAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const all = await UserScreeningItem.find({ user: userId }).sort({ updatedAt: -1 }).lean();
    const seen = new Set();
    const toDelete = [];
    for (const it of all) {
      const dedupKey = `${it.itemId}||${it.reportId || ''}`;
      if (seen.has(dedupKey)) {
        toDelete.push(it._id);
      } else {
        seen.add(dedupKey);
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

// ── 家庭医师处理血压异常升级（AI自动跟进试点）──
// PATCH /api/staff/health-records/:id/resolve-alert
router.patch('/health-records/:id/resolve-alert', staffAuth, async (req, res) => {
  try {
    const record = await HealthRecord.findOneAndUpdate(
      { _id: req.params.id, aiAlertStatus: 'pending' },
      { $set: { aiAlertStatus: 'resolved' } },
      { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: '记录不存在或已处理' });
    res.json({ success: true, data: record });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 医护端代患者录入初始健康数据（与用户端格式一致）─────────────────
// POST /api/staff/patients/:id/health-records
router.post('/patients/:id/health-records', staffAuth, async (req, res) => {
  try {
    const { type, value, extra, note, recordedAt } = req.body;
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
    // recordedAt 支持历史补录（老客户既往数据整理录入）——未传则用当前时间。（2026-07-10 金娟）
    const recRecord = {
      user:     req.params.id,
      category: meta.category,
      type,
      label:    meta.label,
      unit:     meta.unit,
      value:    String(value),
      extra:    extra || {},
      note:     note || '',
    };
    if (recordedAt) {
      const d = new Date(recordedAt);
      if (!isNaN(d.getTime())) recRecord.recordedAt = d;
    }
    const record = await HealthRecord.create(recRecord);
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
router.get('/checkin-overview', staffAuth, checkPermission('daily_checkin', 'view'), async (req, res) => {
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

    // 按患者分组：同一类型当天可能打卡多次（如血压测3次），全部保留，不只取最新一条
    const byPatient = {};
    records.forEach(r => {
      const uid = String(r.user);
      if (!byPatient[uid]) byPatient[uid] = { latestAt: r.recordedAt, types: {} };
      if (r.recordedAt > byPatient[uid].latestAt) byPatient[uid].latestAt = r.recordedAt;
      if (!byPatient[uid].types[r.type]) byPatient[uid].types[r.type] = [];
      byPatient[uid].types[r.type].push(r);
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
          doneItems: doneTypes.flatMap(t => data.types[t].map(r => ({
            type: t, label: TYPE_LABEL[t] || t,
            value: r.value, unit: r.unit || '', recordedAt: r.recordedAt,
          }))),
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
// body: { year, scope: 'doctor'|'nutrition'|'all'（默认all，兼容旧前端）, force: boolean（对方已审核时二次确认后传true）}
const { generateHealthSummarySections, DOCTOR_KEYS, LIFESTYLE_KEY } = require('../utils/aiHealthSummary');
router.post('/patients/:id/ai-health-summary', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('assignedHealthManager', 'name')
      .populate('assignedFamilyDoctor', 'name')
      .populate('assignedNutritionist', 'name');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const scope = req.body.scope || 'all';
    const force = !!req.body.force;
    const year = String(req.body.year || new Date().getFullYear());
    const existing = user.aiHealthSummary || {};
    const byYear = { ...(existing.byYear || {}) };
    // 旧数据迁移：有顶层 sections 但无 byYear，先归档到其原年份（默认2026）
    if (existing.sections && Object.keys(byYear).length === 0) {
      const oy = String(existing.generatedAt ? new Date(existing.generatedAt).getFullYear() : 2026);
      byYear[oy] = { sections: existing.sections, generatedAt: existing.generatedAt || null, approvedAt: existing.approvedAt || null, approvedBy: existing.approvedBy || null };
    }
    const prevEntry = byYear[year] || {};

    // 对方维度已审核时需二次确认，未带 force 标志直接拒绝，前端据此弹确认框
    if (!force) {
      if ((scope === 'doctor' || scope === 'all') && prevEntry.doctorApprovedAt) {
        return res.status(409).json({ success: false, needConfirm: true, message: '5维度分析已由家庭医师审核通过，重新生成将清除该审核状态', approvedBy: prevEntry.doctorApprovedBy });
      }
      if ((scope === 'nutrition' || scope === 'all') && prevEntry.nutritionApprovedAt) {
        return res.status(409).json({ success: false, needConfirm: true, message: '生活方式评估已由营养师审核通过，重新生成将清除该审核状态', approvedBy: prevEntry.nutritionApprovedBy });
      }
    }

    const { sections: genResult, failed } = await generateHealthSummarySections(user, { scope, existingSections: prevEntry.sections || null });
    // AI返回解析失败或本该生成的板块是空壳内容：不写入数据库，直接报错，避免前端显示"已生成"却看不到内容
    // （2026-07-07 赵菲盈反馈"生活方式评估提示已生成但实际没有"即此场景——此前空壳会被当成功写入）
    if (failed) {
      return res.status(500).json({ success: false, message: 'AI生成失败或返回内容为空，请重试' });
    }

    // 合并：只替换本次 scope 涉及的板块，另一方板块沿用旧值，互不覆盖
    const mergedSections = { ...(prevEntry.sections || {}) };
    if (scope === 'all') {
      Object.assign(mergedSections, genResult);
    } else if (scope === 'doctor') {
      DOCTOR_KEYS.forEach(k => { if (genResult[k] !== undefined) mergedSections[k] = genResult[k]; });
    } else if (scope === 'nutrition') {
      if (genResult[LIFESTYLE_KEY] !== undefined) mergedSections[LIFESTYLE_KEY] = genResult[LIFESTYLE_KEY];
    }

    const entry = { ...prevEntry, sections: mergedSections, generatedAt: new Date() };
    // 清空审核状态：只清本次实际重新生成一方的审核字段，未涉及的一方保留
    if (scope === 'doctor' || scope === 'all') { entry.doctorApprovedAt = null; entry.doctorApprovedBy = null; }
    if (scope === 'nutrition' || scope === 'all') { entry.nutritionApprovedAt = null; entry.nutritionApprovedBy = null; }
    entry.approvedAt = (entry.doctorApprovedAt && entry.nutritionApprovedAt) ? entry.approvedAt : null;
    if (!entry.approvedAt) entry.approvedBy = null;

    byYear[year] = entry;
    const summary = {
      sections: mergedSections, generatedAt: entry.generatedAt,
      approvedAt: entry.approvedAt || null, approvedBy: entry.approvedBy || null,
      doctorApprovedAt: entry.doctorApprovedAt || null, doctorApprovedBy: entry.doctorApprovedBy || null,
      nutritionApprovedAt: entry.nutritionApprovedAt || null, nutritionApprovedBy: entry.nutritionApprovedBy || null,
      byYear, latestYear: year,
    };

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
      const isSuper = req.staff.role === 'superadmin';
      if ((sc === 'doctor' || sc === 'all')) {
        if (!isSuper && req.staff.role !== 'familyDoctor') return res.status(403).json({ success: false, message: '仅家庭医生可审核该维度' });
        entry.doctorApprovedAt = now; entry.doctorApprovedBy = req.staff.name;
      }
      if ((sc === 'nutrition' || sc === 'all')) {
        if (!isSuper && req.staff.role !== 'nutritionist') return res.status(403).json({ success: false, message: '仅营养师可审核该维度' });
        entry.nutritionApprovedAt = now; entry.nutritionApprovedBy = req.staff.name;
      }
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

// POST /api/staff/patients/:id/ai-health-summary/discussions — 团队针对AI健康分析的讨论留言（按年度，纯团队内部留言，AI不参与回复）
router.post('/patients/:id/ai-health-summary/discussions', staffAuth, async (req, res) => {
  try {
    const { content, year } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ success: false, message: '留言内容不能为空' });
    const user = await User.findById(req.params.id).select('aiHealthSummary');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const current = user.aiHealthSummary || {};
    const byYear = { ...(current.byYear || {}) };
    const y = String(year || current.latestYear || new Date().getFullYear());
    const entry = { ...(byYear[y] || {}) };
    const discussions = Array.isArray(entry.discussions) ? [...entry.discussions] : [];
    discussions.push({
      staffId: req.staff._id,
      staffName: req.staff.name || '',
      staffRole: req.staff.roleLabel || req.staff.role || '',
      content: content.trim(),
      createdAt: new Date(),
    });
    entry.discussions = discussions;
    byYear[y] = entry;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiHealthSummary.byYear.${y}.discussions`]: discussions } }
    );
    res.json({ success: true, data: discussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/ai-health-summary/discussions/:index — 撤回自己发的一条留言（仅本人或超管）
router.delete('/patients/:id/ai-health-summary/discussions/:index', staffAuth, async (req, res) => {
  try {
    const { year } = req.query;
    const idx = Number(req.params.index);
    const user = await User.findById(req.params.id).select('aiHealthSummary');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const current = user.aiHealthSummary || {};
    const byYear = current.byYear || {};
    const y = String(year || current.latestYear || new Date().getFullYear());
    const discussions = Array.isArray(byYear[y]?.discussions) ? [...byYear[y].discussions] : [];
    const target = discussions[idx];
    if (!target) return res.status(404).json({ success: false, message: '留言不存在' });
    const isOwner = String(target.staffId) === String(req.staff._id);
    if (!isOwner && req.staff.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅本人或超管可删除该留言' });
    discussions.splice(idx, 1);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiHealthSummary.byYear.${y}.discussions`]: discussions } }
    );
    res.json({ success: true, data: discussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/ai-health-summary/discussions/ai-reply — 针对讨论区的疑问，让AI结合主报告结论重新分析并回应
// 回应仅作为讨论区里的一条AI留言展示，不自动改写主报告sections，团队看完认为需要更新仍需手动编辑
router.post('/patients/:id/ai-health-summary/discussions/ai-reply', staffAuth, async (req, res) => {
  try {
    const { year } = req.body;
    const user = await User.findById(req.params.id).select('name gender age aiHealthSummary');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const current = user.aiHealthSummary || {};
    const byYear = current.byYear || {};
    const y = String(year || current.latestYear || new Date().getFullYear());
    const entry = byYear[y] || {};
    const discussions = Array.isArray(entry.discussions) ? entry.discussions : [];
    if (discussions.length === 0) return res.status(400).json({ success: false, message: '暂无讨论留言，无法生成AI回应' });

    const { chat } = require('../utils/ai');
    const sectionsSummary = JSON.stringify(entry.sections || {}).slice(0, 3000);
    const discussionText = discussions.map(d => `${d.isAI ? 'AI' : d.staffName}${d.staffRole ? `（${d.staffRole}）` : ''}：${d.content}`).join('\n');

    const prompt = `你是协助医护团队复核健康分析报告的AI助手。以下是患者${user.name}（${user.gender || ''}，${user.age || '?'}岁）的AI健康分析报告结论摘要，以及医护团队围绕该报告展开的讨论记录。请针对团队最新提出的疑问或补充信息，结合报告已有结论进行解释、推理或修正说明。

【报告结论摘要】
${sectionsSummary}

【讨论记录】
${discussionText}

请直接输出你对团队最新一条留言的回应（150字内，专业、有理有据，如需修正之前的判断请明确指出）：`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 500 });
    const reply = {
      staffId: null,
      staffName: 'AI助手',
      staffRole: '',
      content: (text || '').trim(),
      createdAt: new Date(),
      isAI: true,
    };
    const updatedDiscussions = [...discussions, reply];
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiHealthSummary.byYear.${y}.discussions`]: updatedDiscussions } }
    );
    res.json({ success: true, data: updatedDiscussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 4.5 AI管理方案生成 ──────────────────────────────────────────
// POST /api/staff/patients/:id/ai-annual-plan
// 年度管理方案只有家庭医生/超管可生成（同 annual-plan PUT 接口的角色限制）
router.post('/patients/:id/ai-annual-plan', staffAuth, async (req, res) => {
  if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '仅家庭医生可生成年度管理方案' });
  }
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const ais = user.aiHealthSummary;
    if (!ais || !ais.sections) {
      return res.status(400).json({ success: false, message: '请先生成AI健康分析报告' });
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

    const prompt = `你是一位家庭医师，请根据以下AI健康分析，生成${year}年度健康管理方案，按指定JSON格式输出各板块字段。

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
const { RISK_LEVELS, generateRiskAssessment } = require('../utils/aiRiskAssessment');

// 兼容旧数据：早期版本 aiRiskAssessment 是单个扁平对象，无 byYear。
// 归入其生成年份（无年份则归当前年），与 aiHealthSummary.byYear 的既有迁移方式一致
function riskByYear(raw) {
  if (!raw) return {};
  if (raw.byYear) return raw.byYear;
  if (raw.dimensions || raw.overallLevel) {
    const y = String(raw.generatedAt ? new Date(raw.generatedAt).getFullYear() : new Date().getFullYear());
    return { [y]: raw };
  }
  return {};
}
function riskYearOf(req) {
  return String(req.body?.year || req.query?.year || new Date().getFullYear());
}

// POST /api/staff/patients/:id/ai-risk-assessment — 生成风险评估（year 不填则为当前年）
router.post('/patients/:id/ai-risk-assessment', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('name gender age chronicDiseases healthProfile labValues lifestyle lifestyle_data');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const year = riskYearOf(req);
    const assessment = await generateRiskAssessment(user);
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: assessment } }
    );
    res.json({ success: true, data: assessment, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-risk-assessment — 家庭医生审核/修改（body.year 指定所属年度）
router.patch('/patients/:id/ai-risk-assessment', staffAuth, async (req, res) => {
  try {
    const { dimensions, overallSummary, action } = req.body;
    const year = riskYearOf(req);
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const byYear = riskByYear(user.aiRiskAssessment);
    const updated = { ...(byYear[year] || {}) };
    if (dimensions !== undefined) {
      updated.dimensions = dimensions;
      updated.overallLevel = dimensions.reduce((max, d) =>
        RISK_LEVELS.indexOf(d.level) > RISK_LEVELS.indexOf(max) ? d.level : max, 'low');
    }
    if (overallSummary !== undefined) updated.overallSummary = overallSummary;
    if (action === 'approve') {
      if (req.staff.role !== 'familyDoctor' && req.staff.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: '仅家庭医生可审核风险评估' });
      }
      updated.approvedAt = new Date();
      updated.approvedBy = req.staff.name;
    }
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: updated } }
    );
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── AI风险评估·团队讨论区（与AI健康分析讨论区一致：团队留言 + @AI回应，按年度独立）──
// POST /api/staff/patients/:id/ai-risk-assessment/discussions — 发一条讨论留言（query.year 指定年度）
router.post('/patients/:id/ai-risk-assessment/discussions', staffAuth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: '留言内容不能为空' });
    const year = riskYearOf(req);
    const user = await User.findById(req.params.id).select('aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const byYear = riskByYear(user.aiRiskAssessment);
    const ra = { ...(byYear[year] || {}) };
    const discussions = Array.isArray(ra.discussions) ? [...ra.discussions] : [];
    discussions.push({
      staffId: req.staff._id,
      staffName: req.staff.name,
      staffRole: req.staff.roleLabel || req.staff.role || '',
      content: content.trim(),
      createdAt: new Date(),
      isAI: false,
    });
    ra.discussions = discussions;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: ra } }
    );
    res.json({ success: true, data: discussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/ai-risk-assessment/discussions/:index — 撤回自己发的一条留言（仅本人或超管，query.year 指定年度）
router.delete('/patients/:id/ai-risk-assessment/discussions/:index', staffAuth, async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const year = riskYearOf(req);
    const user = await User.findById(req.params.id).select('aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const byYear = riskByYear(user.aiRiskAssessment);
    const ra = { ...(byYear[year] || {}) };
    const discussions = Array.isArray(ra.discussions) ? [...ra.discussions] : [];
    const target = discussions[idx];
    if (!target) return res.status(404).json({ success: false, message: '留言不存在' });
    if (!target.isAI && String(target.staffId) !== String(req.staff._id) && req.staff.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '只能撤回自己发的留言' });
    }
    discussions.splice(idx, 1);
    ra.discussions = discussions;
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: ra } }
    );
    res.json({ success: true, data: discussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/ai-risk-assessment/discussions/ai-reply — 针对疑问，让AI结合风险评估结论回应（query.year 指定年度）
router.post('/patients/:id/ai-risk-assessment/discussions/ai-reply', staffAuth, async (req, res) => {
  try {
    const year = riskYearOf(req);
    const user = await User.findById(req.params.id).select('name gender age aiRiskAssessment');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const byYear = riskByYear(user.aiRiskAssessment);
    const ra = byYear[year] || {};
    const discussions = Array.isArray(ra.discussions) ? ra.discussions : [];
    if (discussions.length === 0) return res.status(400).json({ success: false, message: '暂无讨论留言，无法生成AI回应' });

    const { chat } = require('../utils/ai');
    const dimsSummary = (Array.isArray(ra.dimensions) ? ra.dimensions : [])
      .map(d => `${d.label}：${d.level}${typeof d.score === 'number' ? `（${d.score}分）` : ''}${d.advice ? `，建议：${d.advice}` : ''}`).join('\n');
    const discussionText = discussions.map(d => `${d.isAI ? 'AI' : d.staffName}${d.staffRole ? `（${d.staffRole}）` : ''}：${d.content}`).join('\n');

    const prompt = `你是协助医护团队复核风险评估的AI助手。以下是患者${user.name}（${user.gender || ''}，${user.age || '?'}岁）的AI风险评估结论，以及医护团队围绕该评估展开的讨论。请针对团队最新提出的疑问或补充信息，结合评估结论进行解释、推理或修正说明。

【整体风险】${ra.overallLevel || '未知'}${ra.overallSummary ? `：${ra.overallSummary}` : ''}
【各维度评估】
${dimsSummary || '无'}

【讨论记录】
${discussionText}

请直接输出你对团队最新一条留言的回应（150字内，专业、有理有据，如需修正之前的判断请明确指出）：`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 500 });
    const reply = {
      staffId: null, staffName: 'AI助手', staffRole: '',
      content: (text || '').trim(), createdAt: new Date(), isAI: true,
    };
    const updatedDiscussions = [...discussions, reply];
    const updatedRa = { ...ra, discussions: updatedDiscussions };
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $set: { [`aiRiskAssessment.byYear.${year}`]: updatedRa } }
    );
    res.json({ success: true, data: updatedDiscussions });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 10年ASCVD风险评估（医护端录入体检参数→按中国指南自动分层，按年度存储）──
// POST /api/staff/patients/:id/ascvd-risk — 计算并保存（body.year 不填则为当前年）
router.post('/patients/:id/ascvd-risk', staffAuth, async (req, res) => {
  try {
    const { assessAscvd } = require('../utils/ascvdRisk');
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });
    const year = String(req.body?.year || new Date().getFullYear());
    const result = assessAscvd(req.body || {});
    result.evaluatedBy = req.staff.name;
    // 2026-07-09修复金娟反馈"ASCVD无法保存"：老用户 ascvdRisk 字段可能是 null（非对象），
    // 直接用点路径 $set 'ascvdRisk.byYear.2026' 会报 "Cannot create field 'byYear' in element {ascvdRisk: null}" → 500。
    // 先确保 ascvdRisk / ascvdRisk.byYear 是对象再写入。
    const _oid = new mongoose.Types.ObjectId(req.params.id);
    const cur = await User.collection.findOne({ _id: _oid }, { projection: { ascvdRisk: 1 } });
    if (!cur || cur.ascvdRisk === null || typeof cur.ascvdRisk !== 'object' || Array.isArray(cur.ascvdRisk)) {
      await User.collection.updateOne({ _id: _oid }, { $set: { ascvdRisk: { byYear: {} } } });
    } else if (cur.ascvdRisk.byYear === null || typeof cur.ascvdRisk.byYear !== 'object' || Array.isArray(cur.ascvdRisk.byYear)) {
      await User.collection.updateOne({ _id: _oid }, { $set: { 'ascvdRisk.byYear': {} } });
    }
    await User.collection.updateOne(
      { _id: _oid },
      { $set: { [`ascvdRisk.byYear.${year}`]: result } }
    );
    res.json({ success: true, data: result, year });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/staff/patients/:id/ascvd-risk?year=2026 — 清除指定年度评估（不传year默认清当前年）
router.delete('/patients/:id/ascvd-risk', staffAuth, async (req, res) => {
  try {
    const year = String(req.query?.year || new Date().getFullYear());
    await User.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(req.params.id) },
      { $unset: { [`ascvdRisk.byYear.${year}`]: '' } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景九：AI 用药建议（已下线）──────────────────────────────────────
// 业务决策：健康管理定位不涉足诊疗判断，用药建议交由临床医生负责，AI不再生成/审核用药建议
router.post('/patients/:id/ai-medication-suggest', staffAuth, async (req, res) => {
  res.status(410).json({ success: false, message: 'AI用药建议功能已下线，请由临床医生负责用药调整' });
});

router.patch('/patients/:id/medications/:mid/ai-review', staffAuth, async (req, res) => {
  res.status(410).json({ success: false, message: 'AI用药建议功能已下线' });
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
// action: approve/reject 仅限营养师或超管（审核权限）；withdraw 仅限生成人本人（撤回自己误点生成的待审核建议）
router.patch('/patients/:id/supplements/:sid/ai-review', staffAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const sup = await Supplement.findOne({ _id: req.params.sid, user: req.params.id, aiStatus: 'pending' });
    if (!sup) return res.status(404).json({ success: false, message: '未找到待审核的营养素记录' });

    const isNutritionist = req.staff.role === 'nutritionist' || req.staff.role === 'superadmin';
    const isGenerator = String(sup.staffId) === String(req.staff._id);

    if (action === 'approve' || action === 'reject') {
      if (!isNutritionist) return res.status(403).json({ success: false, message: '仅营养师可审核该建议' });
      if (action === 'approve') {
        sup.aiStatus = 'approved';
        await sup.save();
        return res.json({ success: true, message: '已采纳营养素建议' });
      }
      await Supplement.deleteOne({ _id: sup._id });
      return res.json({ success: true, message: '已拒绝并删除该建议' });
    }

    if (action === 'withdraw') {
      if (!isGenerator && !isNutritionist) return res.status(403).json({ success: false, message: '仅生成人本人或营养师可撤回该建议' });
      await Supplement.deleteOne({ _id: sup._id });
      return res.json({ success: true, message: '已撤回该建议' });
    }

    res.status(400).json({ success: false, message: 'action 必须为 approve / reject / withdraw' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景十五：AI 转介草稿（家庭医师/任意角色）────────────────────────────
// POST /api/staff/patients/:id/ai-referral-draft
// 要求医生先选定接收人、填好转介原因，AI只负责基于"接收人是谁+医生给的原因+医生本次勾选附带的信息"扩写详细说明，不替医生编造转介原因
router.post('/patients/:id/ai-referral-draft', staffAuth, async (req, res) => {
  try {
    const { toRole, toName, reason, attachedHealthInfo } = req.body;
    // toRole/toName: 接收方角色/姓名；reason: 医生已填写的转介原因（必填，AI不代为生成）
    // attachedHealthInfo: 医生本次转介勾选附带的信息，[{label, val}]，如"基本信息""长期用药""膳食调查概述"等，与转介弹窗里的附件勾选一一对应
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, message: '请先选择接收人并填写转介原因，AI将据此生成详细说明' });
    }
    const user = await User.findById(req.params.id).select('name gender age');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { chat } = require('../utils/ai');

    let attachedStr = '无（医生本次未附带任何健康档案信息）';
    if (Array.isArray(attachedHealthInfo) && attachedHealthInfo.length > 0) {
      attachedStr = attachedHealthInfo.map(s => {
        const v = s.val;
        const vStr = Array.isArray(v)
          ? v.map(item => typeof item === 'object' ? Object.values(item).filter(Boolean).join(' · ') : item).join('；')
          : (typeof v === 'object' && v !== null ? Object.entries(v).map(([k, vv]) => `${k}：${vv}`).join('；') : String(v));
        return `${s.label}：${vStr}`;
      }).join('\n');
    }

    const prompt = `你是一位家庭医师，正准备将患者转介给同事，请仅基于下方信息扩写一份转介详细说明（不超过150字），包含：主要病情、需要对方协助的具体内容。必须紧扣医生已给出的转介原因和本次实际附带的信息，不要编造转介原因，也不要引用未提供的信息。语气专业，条理清晰。

【患者】${user.name}，${user.gender || ''}，${user.age || '?'}岁
【转介目标】${toRole || '医护人员'}${toName ? `（${toName}）` : ''}
【医生给出的转介原因】${reason.trim()}
【本次附带的健康信息】
${attachedStr}

请直接输出详细说明正文（不要加"详细说明："前缀，不要输出转介原因，120字内）：`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 350 });
    res.json({
      success: true,
      data: { content: text.trim().slice(0, 350) },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// AI草稿凭证：生成预览时签发，采纳/发送时校验——防止"预览不落库"后权限校验被客户端回传的generatedById伪造
// （草稿本身不落库，服务端无权威记录可比对，故用短期签名token代替，token由服务端签发不可伪造）
function signDraftToken(staffId, patientId, kind) {
  return jwt.sign({ staffId: String(staffId), patientId: String(patientId), kind }, process.env.JWT_SECRET, { expiresIn: '2h' });
}
function verifyDraftToken(token, patientId, kind, staffId) {
  if (!token) return false;
  try {
    const d = jwt.verify(token, process.env.JWT_SECRET);
    return d.kind === kind && String(d.patientId) === String(patientId) && String(d.staffId) === String(staffId);
  } catch { return false; }
}

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
    // 仅生成并返回预览，不写库：用户在弹窗里看完可直接关闭丢弃，只有点"保存并采纳"才会真正创建随访计划
    const suggestion = {
      timing: VALID_TIMING.includes(raw.timing) ? raw.timing : 'keep',
      timingReason: raw.timingReason || '',
      suggestedDate: raw.suggestedDate || '',
      theme: raw.theme || '常规随访',
      outline: Array.isArray(raw.outline) ? raw.outline : [],
      generatedAt: new Date(),
      generatedBy: req.staff.name || '',
      generatedById: req.staff._id,
      draftToken: signDraftToken(req.staff._id, user._id, 'followup'),
    };
    res.json({ success: true, data: suggestion });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-followup-draft — 采纳AI随访建议预览，直接创建随访计划（预览不落库，仅采纳时一次性写入）
// 仅生成人本人或超管可采纳：谁生成的AI建议谁负责决定是否采纳，健管专员是执行者（被指派到assignedTo），不参与决策关卡
router.patch('/patients/:id/ai-followup-draft', staffAuth, async (req, res) => {
  try {
    const { action, notes, edits, draftToken } = req.body; // action: approve；edits: 预览弹窗里的完整内容（未落库，前端原样传回）{theme, suggestedDate, timingReason, outline, type, assignedTo}
    if (action !== 'approve') return res.status(400).json({ success: false, message: 'action 必须为 approve' });
    const draft = edits && typeof edits === 'object' ? edits : {};
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const isSuperadmin = req.staff.role === 'superadmin';
    const isGenerator = verifyDraftToken(draftToken, user._id, 'followup', req.staff._id);
    if (!isSuperadmin && !isGenerator) return res.status(403).json({ success: false, message: '仅生成人本人可采纳该建议' });
    if (!draft.assignedTo) return res.status(400).json({ success: false, message: '请先选择随访人员再采纳' });

    // 创建随访计划：AI的时机判断+随访提纲写入 content（随访内容记录），便于后续查看/编辑时直接看到并在此基础上修改，而不是内容为空重新编写
    const VALID_TYPES = ['phone', 'wechat', 'visit', 'video', 'other'];
    const fu = await FollowUp.create({
      patientId: user._id,
      staffId: req.staff._id,
      date: draft.suggestedDate ? new Date(draft.suggestedDate) : new Date(),
      theme: draft.theme || '常规随访',
      type: VALID_TYPES.includes(draft.type) ? draft.type : 'phone',
      assignedTo: draft.assignedTo,
      status: 'planned',
      aiGenerated: true,
      content: [
        draft.timingReason ? `时机判断：${draft.timingReason}` : '',
        Array.isArray(draft.outline) && draft.outline.length ? '随访要点：\n' + draft.outline.map((o, i) => `${i + 1}. ${o}`).join('\n') : '',
      ].filter(Boolean).join('\n\n'),
      notes: notes ? `审核备注：${notes}` : '',
    });
    res.json({ success: true, message: '已采纳，随访计划已创建', followUpId: fu._id });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/staff/patients/:id/ai-followup-monthly-review — 月度AI回顾：结合近30天打卡数据判断随访时机，
// 直接落库为 aiStatus:pending 的随访建议，走 followup_review 待办队列由家庭医生审核（区别于ai-followup-suggestion的单患者预览+本人采纳模式，这里是批量自动化场景）
router.post('/patients/:id/ai-followup-monthly-review', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name gender age chronicDiseases labValues');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const { runMonthlyFollowUpReview } = require('../utils/followupReview');
    const fu = await runMonthlyFollowUpReview(user, req.staff._id);
    if (!fu) return res.json({ success: true, message: '本月无需新增随访', created: false });
    res.json({ success: true, message: '已生成待审核随访建议', created: true, followUpId: fu._id });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── 场景九：AI 健康教练消息（依从性评估 + 鼓励/提醒消息）──────────────
// POST /api/staff/patients/:id/ai-coach-message
router.post('/patients/:id/ai-coach-message', staffAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name gender age chronicDiseases preferredTitle');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    // 称呼：优先医护标注的 preferredTitle，否则按性别得体兜底
    const surname = (user.name || '').trim().charAt(0);
    const coachTitle = (user.preferredTitle && user.preferredTitle.trim())
      ? user.preferredTitle.trim()
      : (user.gender === '男' ? (surname ? surname + '先生' : user.name)
         : user.gender === '女' ? (surname ? surname + '女士' : user.name)
         : user.name);

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

【会员】${user.name}，性别：${user.gender || '未知'}，慢病标签：${user.chronicDiseases?.join('、') || '无'}
【称呼】必须称呼对方为"${coachTitle}"，不要自己改称呼，绝对不要叫错性别（如男性叫"姐"）。
【打卡情况】连续打卡 ${streak} 天，距上次打卡 ${daysSinceLast >= 999 ? '很久' : daysSinceLast + ' 天'}
【消息类型】${tone}（依从性${adherence === 'high' ? '良好' : adherence === 'medium' ? '一般' : '偏低'}）

请直接输出消息正文。`;

    const message = await chat([{ role: 'user', content: prompt }], { maxTokens: 300 });
    // 仅生成并返回预览，不写库：用户在弹窗里看完可直接关闭丢弃，只有点"发送给会员"才会真正发送
    const coachDraft = {
      message: (message || '').trim(),
      adherence, streak,
      daysSinceLast: daysSinceLast >= 999 ? null : daysSinceLast,
      tone,
      generatedAt: new Date(),
      generatedBy: req.staff.name || '',
      generatedById: req.staff._id,
      draftToken: signDraftToken(req.staff._id, user._id, 'coach'),
    };
    res.json({ success: true, data: coachDraft });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/staff/patients/:id/ai-coach-draft — 发送AI教练消息预览（预览不落库，发送时一次性写入PushRecord）
// 仅生成人本人或超管可发送：谁生成的AI消息谁负责决定是否发送
router.patch('/patients/:id/ai-coach-draft', staffAuth, async (req, res) => {
  try {
    const { action, message: editedMessage, draftToken } = req.body; // action: approve
    if (action !== 'approve') return res.status(400).json({ success: false, message: 'action 必须为 approve' });
    const user = await User.findById(req.params.id).select('_id');
    if (!user) return res.status(404).json({ success: false, message: '患者不存在' });

    const isSuperadmin = req.staff.role === 'superadmin';
    const isGenerator = verifyDraftToken(draftToken, user._id, 'coach', req.staff._id);
    if (!isSuperadmin && !isGenerator) return res.status(403).json({ success: false, message: '仅生成人本人可发送该消息' });

    const finalMsg = (editedMessage || '').trim();
    if (!finalMsg) return res.status(400).json({ success: false, message: '消息内容不能为空' });
    await PushRecord.create({
      staffId: req.staff._id, patientId: user._id,
      type: 'notice', title: '健康教练', content: finalMsg,
    });
    res.json({ success: true, message: '消息已发送给会员' });
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

    const latestRiskYears = Object.keys(riskByYear(user.aiRiskAssessment)).sort((a, b) => Number(b) - Number(a));
    const latestRisk = latestRiskYears.length ? riskByYear(user.aiRiskAssessment)[latestRiskYears[0]] : null;
    const riskFactors = (latestRisk?.dimensions || [])
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
// 2026-07-03修复：此前要求 screeningCategory/screeningL1 非空，这两个字段只有"人工手动录入专项筛查"
// 路径才会写，AI OCR自动识别的报告（runReportParse写入UserScreeningItem）完全不带这两个字段，
// 导致走AI识别流程的患者（如潘孝银这批单次上传报告）"体检关键指标"板块永远查不到数据、全部空白。
// 前端消费这份数据是按reportItems里的关键词自行匹配提取(REPORT_KEY_MAP)，不依赖这两个字段，
// 去掉这个限制、直接返回该患者全部报告即可覆盖AI识别路径，不影响原有人工录入数据的展示。
router.get('/patients/:id/screening-reports', staffAuth, async (req, res) => {
  try {
    const reports = await MedicalReport.find({
      user: req.params.id,
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
  checkup_plan_review:  'healthManager',
  summary_review:       'familyDoctor',
  risk_review:          'familyDoctor',
  medication_review:    'familyDoctor',
  lifestyle_review:     'nutritionist',
  supplement_review:    'nutritionist',
  nutrition_plan_review:'nutritionist',
  followup_review:      'familyDoctor',
  bp_alert_review:      'familyDoctor',
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
    // followup_review 例外：随访待审核按来源方案类型分流给不同角色（年度管理方案/体检方案→家庭医生，营养方案→营养师），
    // 不是固定单一角色，TODO_REVIEW_ROLE 的单值映射覆盖不了，这里放宽通过条件，具体过滤见下方按 reviewRole 分流
    const canFollowupReview = isSuper || role === 'familyDoctor' || role === 'nutritionist';

    const now = new Date();
    const DAY = 24 * 60 * 60 * 1000;
    const todos = [];

    // 患者归属过滤：AI待办此前只按"角色能不能审这个类型"过滤，完全没按"这个患者是不是自己名下"过滤——
    // 2026-07-07 反馈：患者潘孝银归属营养师吴苗苗，但营养师赵菲盈也能在自己的待审核列表里看到该患者的任务。
    // 这里按角色对应的 assignedXxx 字段查出"自己名下患者"的ID集合，下面每个查询都加上这个范围限制。
    const ROLE_ASSIGN_FIELD = {
      healthManager: 'assignedHealthManager',
      familyDoctor: 'assignedFamilyDoctor',
      nutritionist: 'assignedNutritionist',
      medicalAssistant: 'assignedMedicalAssistant',
      psychologist: 'assignedPsychologist',
      rehabSpecialist: 'assignedRehabSpecialist',
      tcmDoctor: 'assignedTcmDoctor',
      specialist: 'assignedSpecialist',
    };
    let myPatientIds = null; // null = 不限制（超管）；否则是当前角色名下患者ID数组
    if (!isSuper) {
      const assignField = ROLE_ASSIGN_FIELD[role];
      if (assignField) {
        const myPatients = await User.find({ [assignField]: req.staff._id }).select('_id').lean();
        myPatientIds = myPatients.map(p => p._id);
      } else {
        myPatientIds = []; // 角色没有对应归属字段（如healthPlanner），保守起见不展示任何患者相关待办
      }
    }
    const myPatientIdSet = myPatientIds ? new Set(myPatientIds.map(String)) : null;
    const inMyScope = (userId) => !myPatientIdSet || myPatientIdSet.has(String(userId));

    // ── 健管专员：体检报告 OCR 待审核（aiStatus=pending）──
    if (can('report_review')) {
      const reportFilter = { aiStatus: 'pending', ...(myPatientIds ? { user: { $in: myPatientIds } } : {}) };
      const pendingReports = await MedicalReport.find(reportFilter)
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
      const archiveFilter = { archiveDraft: { $ne: null }, ...(myPatientIds ? { _id: { $in: myPatientIds } } : {}) };
      const draftUsers = await User.find(archiveFilter)
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
      // summary_review(家庭医生)和lifestyle_review(营养师)各自归属字段不同，若都能审(如superadmin)则不限制；
      // 否则用当前角色对应的患者范围（myPatientIds 已按 role 算好）
      const sumFilter = { aiHealthSummary: { $ne: null }, ...(myPatientIds ? { _id: { $in: myPatientIds } } : {}) };
      const sumUsers = await User.find(sumFilter)
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
        // 家庭医师审 5 维（整体未通过 && 医师维度未通过；自助生成的免审核，不进队列）
        if (can('summary_review') && e.source !== 'self_service' && !e.approvedAt && !e.doctorApprovedAt) {
          todos.push({
            id: 'summary_' + u._id, type: 'summary_review', label: 'AI健康分析待审核（5维度）', priority: 2,
            patientName: u.name || '未知', patientId: String(u._id),
            summary: `${y}年度 · 肿瘤/心脑血管/慢病/体检全面性/优先医疗问题`,
            createdAt, overdue, link: `/patients/${u._id}?tab=ai&aiYear=${y}`,
          });
        }
        // 营养师审「生活方式评估」单维度
        const hasLifestyle = !!e.sections.lifestyle_assessment &&
          ((e.sections.lifestyle_assessment.items || []).length > 0 || e.sections.lifestyle_assessment.summary);
        if (can('lifestyle_review') && e.source !== 'self_service' && hasLifestyle && !e.approvedAt && !e.nutritionApprovedAt) {
          todos.push({
            id: 'lifestyle_' + u._id, type: 'lifestyle_review', label: '生活方式评估待审核', priority: 3,
            patientName: u.name || '未知', patientId: String(u._id),
            summary: `${y}年度 · AI健康分析「生活方式评估」维度`,
            createdAt, overdue, link: `/patients/${u._id}?tab=ai&aiYear=${y}`,
          });
        }
      });
    }

    // ── 家庭医师：AI用药建议待审核 ──
    if (can('medication_review')) {
      const medFilter = { aiStatus: 'pending', ...(myPatientIds ? { user: { $in: myPatientIds } } : {}) };
      const pendingMeds = await Medication.find(medFilter)
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
      const supFilter = { aiStatus: 'pending', ...(myPatientIds ? { user: { $in: myPatientIds } } : {}) };
      const pendingSups = await Supplement.find(supFilter)
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

    // ── 营养师：AI营养干预方案待审核 ──
    if (can('nutrition_plan_review')) {
      const nutriPlanFilter = { type: 'nutrition', 'content.aiStatus': 'pending', ...(myPatientIds ? { patientId: { $in: myPatientIds } } : {}) };
      const nutritionPlans = await HealthPlan.find(nutriPlanFilter)
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
      const checkupPlanFilter = { type: 'annual_checkup', 'content.aiStatus': 'pending', ...(myPatientIds ? { patientId: { $in: myPatientIds } } : {}) };
      const checkupPlans = await HealthPlan.find(checkupPlanFilter)
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

    // ── 方案确认后自动生成的随访计划待审核：按 reviewRole 分流（未设置的旧数据默认归家庭医生）──
    if (canFollowupReview) {
      const pendingFollowUps = await FollowUp.find({ aiStatus: 'pending' })
        .populate('patientId', 'name').sort({ date: 1 }).limit(50).lean();
      pendingFollowUps.forEach(f => {
        const belongsToRole = f.reviewRole || 'familyDoctor';
        if (!isSuper && belongsToRole !== role) return;
        if (!inMyScope(f.patientId?._id)) return;
        const createdAt = f.createdAt || new Date();
        const sourceLabel = f.sourceType === 'ai_review' ? '（AI月度回顾）' : f.sourceType === 'health_plan' ? '（方案确认后生成）' : '（方案排期）';
        todos.push({
          id: 'followup_' + f._id, type: 'followup_review', label: '随访计划待审核', priority: 3,
          patientName: f.patientId?.name || '未知', patientId: String(f.patientId?._id || ''),
          summary: `${f.theme || '随访'} · ${String(f.date).slice(0, 10)}${sourceLabel}`,
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${f.patientId?._id}?tab=followups`,
        });
      });
    }

    // ── 家庭医师：血压监测异常升级（AI自动跟进试点）──
    if (can('bp_alert_review')) {
      const bpFilter = { type: 'bloodPressure', aiAlertStatus: 'pending', ...(myPatientIds ? { user: { $in: myPatientIds } } : {}) };
      const alertRecords = await HealthRecord.find(bpFilter)
        .populate('user', 'name').sort({ recordedAt: -1 }).limit(50).lean();
      alertRecords.forEach(r => {
        const createdAt = r.recordedAt || r.createdAt;
        const sys = r.extra?.sys || String(r.value).split('/')[0];
        todos.push({
          id: 'bp_alert_' + r._id, type: 'bp_alert_review', label: '血压监测异常·待处理', priority: 1,
          patientName: r.user?.name || '未知', patientId: String(r.user?._id || ''),
          summary: `AI监测发现收缩压 ${sys} mmHg（危险级），患者已自主打卡，请医生核实处理`,
          createdAt, overdue: (now - new Date(createdAt)) > DAY,
          link: `/patients/${r.user?._id}?tab=records`,
        });
      });
    }

    // ── 家庭医师：风险预警待处理 → User.aiRiskAssessment(按年度) 最近一年 高/危急 且未审核 ──
    if (can('risk_review')) {
      const riskFilter = { aiRiskAssessment: { $ne: null }, ...(myPatientIds ? { _id: { $in: myPatientIds } } : {}) };
      const riskUsers = await User.find(riskFilter).select('name aiRiskAssessment').limit(200).lean();
      riskUsers.forEach(u => {
        const byYear = riskByYear(u.aiRiskAssessment);
        const years = Object.keys(byYear).sort((a, b) => Number(b) - Number(a));
        const y = years[0];
        if (!y) return;
        const ra = byYear[y] || {};
        if (!ra.alerted || ra.approvedAt) return;
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
规则B：跳过汇总页——页面标题含"异常结果""检查结果"等字样再加上"汇总""说明""及建议""及说明""解读"等词的组合（如"异常结果汇总""体检结果汇总""异常结果及建议""体检异常结果及说明"，不要求逐字匹配这几个例子，只要是同类"异常/结果+说明性后缀"的标题都算），或以"尊敬的XX先生/女士"开头的综合小结页，整页跳过不提取。判断汇总页的核心标准：这一页是把多个不同检查项目（胃镜/肠镜/超声/放射等）的结论压缩摘要在同一页里罗列，而不是聚焦单一检查项目的完整详细报告单。这类汇总页有时按科室分组罗列诊断名词（如"放射科：1、右肺结节 2、左肾上腺增粗"／"消化内镜：1、内痔 2、大肠息肉"），即使看起来像分了类别标题，这仍是汇总页，不是具体检查项目，禁止把"放射科""消化内镜""病理科""彩超"等科室/类别标题当成 name 生成条目，也不能把里面的诊断名词列表当作findings/diagnosis提取——这些内容详细报告单里都有，只从详细报告单提取。
规则B2：跳过"名词解释""检查异常结果解读""温馨提示""健康建议"类科普说明页——这类页面是对某个诊断名词（如"甲状腺结节3类是什么"）的通用医学科普介绍，不是本次检查的具体所见，禁止把这类科普文字当成检查所见/项目提取（如"肾结石多与饮水少有关，建议..."这种句子禁止提取为任何条目）。
规则C：跳过目录页、项目清单页（只有项目名称没有结果的页面）。
规则D：name 字段必须干净，去除【】[]《》等括号符号和序号前缀，例：✗"内科】" → ✓"内科"。
规则E：相似项目名称不可混淆，如"碳13"≠"碳14"，"空腹血糖"≠"餐后血糖"。
规则F：检验数值必须与其对应项目严格匹配，不可串行填写。
规则G：findings/diagnosis/conclusion 字段只填报告原文，不加解释或分析。
规则H：诊断结论性短语本身不是检查项目，禁止单独作为一条 name 提取。如"左肾上腺稍增粗""慢性浅表性胃炎""窦性心动过缓""血脂异常""饮酒史""内痔"这类词，只是某个检查项目（如腹部超声/胃镜/心电图/血脂化验/既往史问诊）的诊断结论或病史条目，必须整句放进对应检查项目的 diagnosis/findings 字段里，不能单独拆出来生成新的 name/条目。判断标准：如果这段文字没有具体的测量数值/检查所见描述，只是一个诊断名词或病史陈述，就不能作为独立项目。

【提取规则（按检查类型）】

1. 一般检查（身高/体重/BMI/脉搏）
   → itemType="data"，每项单独一条
   → name=项目名，value=数值，unit=单位，referenceRange=参考范围
   → conclusion=该项小结原文（如有）
   → 【严禁编造】身高/体重/血压/脉搏这类生命体征，报告原文只写了一个数值就只输出一条，
     绝对不能自己拆出"左侧/右侧""左上肢/右上肢"这类报告里并不存在的分组条目

2. 血压
   → itemType="data"，name="血压"
   → value=血压值（如"120/80"），unit="mmHg"
   → conclusion=小结原文（如有）
   → 报告原文只有一个血压值就只输出一条名为"血压"的记录，不要编造"左上肢血压""右上肢血压"
     这类原文没有写的分侧数据；只有报告原文确实分别印着左右两侧血压时才能各自输出一条

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
   → itemType="imaging"，name="尿常规"或"粪便常规"，整体一条，不罗列单项
   → findings 只写异常/阳性的指标（如"尿隐血：弱阳性(±)"），正常/阴性的指标不用逐条罗列，findings 留空或写"未见明显异常"即可
   → diagnosis=结论/小结原文

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

10. 胃镜 / 肠镜（含胃镜/肠镜病理，统一在一条记录里输出，不要自己判断拆成几条）
    → 一份胃肠镜报告最多只输出一条胃镜记录 + 一条肠镜记录（同时做了才两条都出，只做一种只出一条）
    → itemType="imaging"，name="胃镜检查"/"肠镜检查"
    → findings = 报告原文里内镜医生镜下所见的完整原文（描述粘膜/形态，如"粘膜光滑""充血水肿""见息肉"），按报告顺序整段抄写，不要删减
    → diagnosis = 报告原文里镜下诊断的完整原文
    → pathologyFindings = 如果报告里另有"大体所见"栏（描述送检标本肉眼形态，如"送检粘膜组织一块，大小0.3×0.2cm"），原样抄写在这里；没有这一栏就留空字符串
    → pathologyDiagnosis = 如果报告里另有病理化验结果（含"慢性炎症""活动性""萎缩""肠化""HP""异型增生"等病理化验用词的病理诊断结论），原样抄写在这里；没有就留空字符串
    → conclusion = 同 diagnosis
    → 【重要】pathologyFindings/pathologyDiagnosis 是否为空完全取决于报告里有没有这部分内容，不要因为"看起来应该有"就编造，也不要把病理内容错填进 findings/diagnosis

12. 常规心电图
    → itemType="imaging"，name="心电图"
    → findings=检查所见/描述，conclusion=结论原文，diagnosis=同 conclusion

13. 睡眠呼吸监测 / 动态血压监测（24小时动态血压）
    → 【重要】这类报告必须输出两条【彼此独立】的记录，不能合并成一条，也不能只出一条：
      记录①（数值）：itemType="lab"，name="睡眠呼吸监测"/"动态血压监测"。报告里印刷了具体测量
        数值+单位/参考范围的项（如AHI指数、最长呼吸暂停时长、最长低通气时长、最低血氧饱和度、
        平均血氧饱和度、氧减指数、平均血压、血压负荷值等），逐项提取，不要漏项——数值表格里
        出现的每一行都要提取，不能只挑1-2个"看起来主要"的指标。这条记录的 diagnosis/conclusion
        留空字符串，不要把诊断文字塞进这条里。
      记录②（诊断总结，必须单独输出，不能省略）：itemType="imaging"，name 同上（"睡眠呼吸监测"/
        "动态血压监测"）。睡眠监测报告通常在数值表格之后印有整段文字结论，标题常见"医生诊断意见"
        "初筛睡眠监测图诊断""诊断意见""检查提示"之类；动态血压报告则是"提示存在xx型血压"这类
        整体判断句。只要报告里出现了这类文字段落（不管标题叫什么），必须在这条独立记录里原样
        完整抄写：diagnosis = 该段文字完整原文（多条编号诊断就按原文顺序整段抄，不要摘要、
        不要遗漏任何一条编号），conclusion = diagnosis的内容摘要复述一遍（不能留空）。
      【自查】输出前检查：这两条记录的itemType是否一个是"lab"一个是"imaging"？如果报告里确实
      有诊断文字段落但你只输出了一条记录，或者把诊断文字写进了itemType="lab"那条记录的字段里，
      都是错误的，必须拆成上述两条。
    → name统一为"睡眠呼吸监测"或"动态血压监测"（或报告实际印刷标题），不要与其他检查混淆

14. 人体成分分析（InBody/BCA-2A等体成分测量仪报告）
    → 【重要】不要按检验子项逐条拆分提取（体脂率/肌肉量/水分/骨质/蛋白质/细胞内外液/水肿系数/
      基础代谢等仪器指标五花八门，型号不同措辞差异很大，逐条归类始终对不上号）。
      统一按检查项目整体提取一条：itemType="imaging"，name="人体成分分析"
    → findings = 报告里所有测量数值和指标，逐行原文抄写在一起（如"体脂率28.5% 肌肉量25.3kg
      水分35.2L 基础代谢1420kcal..."），完整保留，不遗漏任何一项数值
    → diagnosis/conclusion = 报告的综合评估/结论原文（如有）
    → 这类报告页面顶部常同时印有"健康评分"（一个0-100的综合评分数字）和"体重"（kg数值），
      两者不再单独提取为独立条目，直接归入这条"人体成分分析"记录的 findings 里一并抄写
      （按各自标签文字原样记录，如"健康评分：85 体重：62.3kg"），跟其他测量数值一起完整保留。

15. 尿常规/尿液分析（报告原名可能是"尿常规"，也可能是"尿液综合分析"等其他叫法，以报告实际印刷的标题为准）
    → 【重要】不要按检验子项逐条拆分提取（尿胆红素/尿酮体/尿隐血/比重/酸碱度/尿亚硝酸盐/
      尿蛋白质/尿胆原/尿糖/尿白细胞/红细胞（流式）/白细胞（流式）/管型（流式）等子项，不同机构的
      名称、缩写、顺序差异很大，逐条归类始终对不上号）。统一按检查项目整体提取一条：
      itemType="imaging"，name=报告上这份检验单实际印刷的标题原文（不要自己编造"尿常规"这个名字）
    → 【重要】同一份尿检验单的子项常常跨页打印（如流式法子项在一页、干化学法子项在下一页），
      只要下一页开头没有出现新的检验单标题，且子项同样是尿液相关指标，就说明是同一份检验单在续页，
      必须合并进同一条记录里，不能因为分页就拆成两条不同名字的记录
    → findings = 报告里该检验单下所有子项名称和结果，逐行原文抄写在一起（如"尿胆红素(BIL)：阴性
      尿酮体(KET)：阴性 尿隐血：阴性 比重(SG)：1.028 酸碱度(PH)：5.5..."），完整保留，不遗漏任何一项
    → diagnosis/conclusion = 报告的综合评估/结论原文（如有）

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
      "conclusion": "主要结论（imaging/data类填写，与diagnosis相同；lab类留空）",
      "pathologyFindings": "仅胃镜/肠镜类填写：大体所见原文，没有则留空字符串",
      "pathologyDiagnosis": "仅胃镜/肠镜类填写：病理诊断原文，没有则留空字符串"
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
// 尿常规/粪便常规（07-02补充）同属这类"整体一条imaging记录、按规则6不拆子项"的项目，此前漏加导致AI误标成lab类型时没被纠正回来
const PHYSICAL_EXAM_NAMES = ['内科', '外科', '耳鼻喉', '视力检查', '眼压检查', '眼科', '裂隙灯检查', '尿常规', '粪便常规'];

// 每次体检最多只应出现一次的检查类型，AI经常写出好几种变体名字（"胃镜"/"电子胃镜"/"无痛胃镜"），
// 导致同一检查因为名字对不上没法被后面的同名去重规则识别成重复——统一改写成标准名，再走已有去重逻辑。
// 病理类判断要放在胃镜/肠镜前面，否则"胃镜病理"会先被"胃镜"关键词命中、归一化错方向。
function canonicalizeExamName(name) {
  const n = name || '';
  if (/胃.{0,4}病理|胃黏膜.*活检/.test(n)) return '胃镜病理';
  if (/肠.{0,4}病理|结肠镜.*病理/.test(n)) return '肠镜病理';
  if (/动态心电图|Holter|24小时.*心电图/i.test(n)) return n; // 动态心电图≠常规心电图，不归一化，保留原名避免混淆
  if (/心电图|^ECG$|^EKG$/i.test(n)) return '常规心电图';
  // "电子胃十二指肠镜检查"这类胃十二指肠联合镜检的正规名称，字面上含有"十二指肠镜"，
  // 会被下面的肠镜正则误命中"肠镜"两个字（十二指-肠镜），实际这是胃部检查，必须先判断走胃镜分支
  if (/胃镜|电子胃镜|无痛胃镜|胃十二指肠镜|胃.{0,3}十二指肠镜/.test(n)) return '胃镜检查';
  if (/肠镜|电子肠镜|无痛肠镜|结肠镜/.test(n)) return '肠镜检查';
  if (/肺CT|胸部CT|肺部CT|低剂量.*CT|CT.*低剂量/i.test(n)) return '肺部CT';
  if (/双眼眼底照相|眼底照相|眼底检查/.test(n)) return '双眼眼底照相';
  if (/^裂隙灯/.test(n)) return '裂隙灯检查';
  if (/^视力/.test(n)) return '视力检查';
  if (/尿常规|尿液干化学分析|尿液分析/.test(n)) return '尿常规';
  if (/粪便常规|大便常规/.test(n)) return '粪便常规';
  if (/^内科/.test(n)) return '内科';
  if (/^外科/.test(n)) return '外科';
  if (/^眼科(?!病史)/.test(n)) return '眼科';
  return n;
}

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
      // 2026-07-02修复：此前正则把开头的"数字"本身当序号前缀无差别清掉（如"25-羟基维生素D"→"-羟基维生素D"，
      // "25"被误删），但很多项目名本身就以数字开头(25-羟基维生素D/13碳呼气试验等)，数字是名字组成部分不是编号。
      // 改成只清除"数字+编号分隔符(、.．:：)"这种明确的编号前缀模式(如"1、XXX"→"XXX")，不再无差别吃掉纯数字。
      let name = (item.name || '')
        .replace(/^[【\[《〔\s]+/, '')
        .replace(/^\d+\s*[、.．:：]\s*/, '')
        .replace(/[】\]》〕\s]+$/, '')
        .trim();
      // 原文里的对勾符号(✓)常被识别成多余的单个英文字母前缀（如"T双眼眼底照相"），导致同一检查因为多字对不上而没法去重
      name = name.replace(/^[A-Za-z](?=[一-龥])/, '');
      // 2026-07-02修复：AI偶尔把项目名重复拼接成"XX, XX"的形式（如"无创性动脉硬化检测, 无创性动脉硬化检测"），
      // 只在"逗号/顿号分隔的两段文字完全相同"这种严格条件下才判定去重，避免误伤真实的并列名称
      const dupMatch = name.match(/^(.+?)[,，、]\s*\1$/);
      if (dupMatch) name = dupMatch[1];
      name = canonicalizeExamName(name);
      const itemType = PHYSICAL_EXAM_NAMES.some(n => name.startsWith(n)) ? 'imaging' : item.itemType;
      // 2026-07-03修复："小结：1、超重"这类前缀常被误抄进不相关检查项目diagnosis字段——是"一般检查"
      // 大类末尾共享小结栏被AI错误摘录进了每一个单独检查项目自己的diagnosis字段(违反规则F：检验数值
      // 必须与其对应项目严格匹配，不可串行填写)，导致身高/脉搏/血压/视力/内科/外科等互不相关的条目
      // diagnosis都写着雷同的"小结：..."文字。只剥离"小结：数字、"这个纯格式性前缀、保留后面的实际
      // 诊断内容，不整条清空——避免误伤"小结：1、翼状胬肉"这种恰好是该项目自身合理诊断、只是格式带了
      // 多余前缀的情况；即使是真串行来的内容，保留下来也不算错误信息，只是去掉不专业的格式痕迹，
      // 比整条删除风险更低。
      const diagnosis = str(item.diagnosis).replace(/^小结[:：]\s*\d+[、.．]\s*/, '');
      return { ...item, name, itemType, diagnosis };
    });
}

// 报告里"名词解释/检查异常结果解读"类科普说明页，有时没被prompt的跳过规则拦住，被当成独立条目提取出来
// （如name="慢性浅表性胃炎"，findings="肾结石多与饮水少...有关，建议..."这种通用医学科普话术，不是本次检查的具体所见）。
// 用"内容像科普建议语气+没有具体测量数据"两个条件一起卡，避免误伤真正带具体数据的检查所见。
const ADVISORY_TEXT_PATTERNS = [
  /多与.{0,12}有关/, /无症状.{0,10}(可)?不(处理|用处理)/, /建议.{0,15}(随诊|复查|干预|治疗|外科)/,
  /如有不适[，,]?\s*请/, /多为良性/, /极少数可能发展为/, /通常无需处理/, /定期复查/, /避免自行/,
  /人群(的)?健康教育/, /健康宣教/, /科普(知识|说明)/,
  /多见于.{0,10}(老年人|近视|人群)/, /可疑有病变(或先天性)?/, /应随访观察/, /多考虑为/,
];
function isAdvisoryEcho(it) {
  const name = str(it.name);
  if (/人群(的)?(健康)?教育|健康宣教|健康指导(建议)?|生活方式指导|膳食指导|运动指导/.test(name)) return true; // name本身就是科普栏目标题，直接判定，无需再看内容
  const text = `${str(it.findings)}${str(it.diagnosis)}`;
  if (!text) return false;
  if (!ADVISORY_TEXT_PATTERNS.some(p => p.test(text))) return false;
  const hasMeasurement = /\d+\s*[×xX]\s*\d+|CDFI|mm|cm|C-TIRADS/.test(text);
  return !hasMeasurement; // 带具体测量数据的不算科普话术，谨慎起见不误删
}
function dropAdvisoryEcho(items) {
  return (items || []).filter(it => !isAdvisoryEcho(it));
}

// 诊断结论性短语（"左肾上腺稍增粗""慢性浅表性胃炎""窦性心动过缓；左心室高电压；T波改变""血脂异常""饮酒史""内痔"等）
// 本该是某个真实检查项目(腹部超声/胃镜/心电图/血脂化验/既往史问诊)的diagnosis/findings内容，却被AI当成了独立项目name提取出来。
// 三重门槛判定，降低误伤真实检查项目的风险：①name命中诊断短语特征词 ②没有具体测量数值 ③归类失败(不在归类库里，真实检查项目一定能归类)。
// 必须放在 classifyItemsAsync 之后调用，依赖 matchStatus 字段（跟 isUnclassifiedNameEcho 同一层级、互补场景：
// 后者抓"findings/diagnosis内容等于name本身"，这个抓"name本身就是诊断词，findings/diagnosis为空或同样是诊断词"）。
const DIAGNOSIS_PHRASE_PATTERNS = [
  /史$/, /^窦性/, /高电压/, /T波改变/, /异常$/, /增粗$/, /增大$/, /^慢性.{0,6}炎$/,
  /结石$/, /结节$/, /息肉$/, /囊肿$/, /^内痔$/, /^外痔$/, /脂肪肝$/,
  /^早复极/, /^(超重|肥胖|消瘦|偏瘦)型$/, // 心电图诊断("早复极现象")、体型分类描述("肥胖型"等)
];
function isDiagnosisPhraseEcho(it) {
  if (it.matchStatus !== 'unclassified') return false;
  const name = str(it.name);
  if (!name || name.length > 15) return false;
  if (!DIAGNOSIS_PHRASE_PATTERNS.some(p => p.test(name))) return false;
  const text = `${str(it.value)}${str(it.findings)}${str(it.diagnosis)}`;
  const hasMeasurement = /\d+\s*[×xX]\s*\d+|CDFI|mm|cm|C-TIRADS|\d+\.\d/.test(text);
  return !hasMeasurement;
}
function dropDiagnosisPhraseEcho(items) {
  return (items || []).filter(it => !isDiagnosisPhraseEcho(it));
}

// 2026-07-02补充：诸如"单纯游离PSA%偏低"这类条目，是AI把某个真实指标(游离前列腺特异性抗原%)异常结果的
// 一句评语误当成了独立检验项目单独提取，value字段还常常跟name自相矛盾(name说"偏低"，value却填"未见异常")。
// 这类词因为name里带着真实指标名的子串(如"PSA")，会被归类算法命中匹配、绕开上面要求matchStatus=unclassified
// 的规则。用更窄的独立判定：name以"偏低/偏高/偏低偏高"结尾，这个后缀模式在真实检验项目名里基本不会出现，
// 风险比放宽上面那条规则的门槛更低，不依赖matchStatus。
function isResultCommentEcho(it) {
  const name = str(it.name);
  if (!name || name.length > 20) return false;
  return /(偏低|偏高)$/.test(name);
}
function dropResultCommentEcho(items) {
  return (items || []).filter(it => !isResultCommentEcho(it));
}

// "异常结果汇总"页有时是编号列表（"1.甲状腺结节 2.大肠多发息肉 3.慢性浅表性胃炎..."），
// 没被跳过规则拦住时，每一行会被单独提取成一条：name=诊断名称，findings/diagnosis="数字、诊断名称原样重复"，没有任何具体检查所见。
// 只在"去掉编号前缀后，内容跟name完全一样"这种严格条件下才判定为汇总echo丢弃，避免误伤带具体所见的正常记录。
// name 本身是科室/检查类别的泛称（不是具体检查项目名），"异常结果汇总"页常按科室分组罗列诊断名词
// （如 name="放射科"，findings="1、右肺下叶磨玻璃结节 2、左肾上腺稍增粗"）——这类跟真实的详细报告单
// （如"肺部CT"/"胃镜检查"）内容完全重复，必须丢弃，否则同一异常会同时出现在汇总条目和详细条目里。
// name 本身用了这种科室/检查类别泛称，就已经是异常信号——真实检查项目的name永远是具体名称
// （"肺部CT"/"胃镜检查"/"甲状腺超声"等），不会是这几个泛称词，不需要再额外要求diagnosis也是编号格式
// （AI有时把diagnosis总结成整句而非列表，只看findings是否为编号列表这一个稳定特征就够）。
// 2026-07-02二次修正：靠猜AI这次用什么科室名（"彩超"→"放射科"→"放射科检查"...）来堵是打地鼠，
// AI每次换个措辞变体就绕过去。改为完全不看name字符串，只看内容结构特征：
// findings是"编号列表+每条都是短诊断名词、无具体测量数据"——这本身就是汇总页的样子，不需要知道AI把name起成什么。
function isDepartmentSummaryEcho(it) {
  const name = str(it.name);
  if (!name || name.length > 8) return false; // 真实检查项目名一般不会是极短泛称，超过8字大概率是具体项目名，不误伤
  const findings = str(it.findings);
  if (!/^\d+\s*[、.．:：]/.test(findings)) return false; // 必须是编号列表开头
  const lines = findings.split(/(?=\d+\s*[、.．:：])/).map(s => s.trim()).filter(Boolean);
  if (lines.length < 2) return false; // 至少2条才算"列表"，单条编号不算
  const hasMeasurement = /\d+\s*[×xX]\s*\d+|CDFI|mm|cm|C-TIRADS/.test(findings);
  if (hasMeasurement) return false; // 带具体测量数据的详细报告单不误删
  const allShort = lines.every(l => l.replace(/^\d+\s*[、.．:：]\s*/, '').length <= 30);
  return allShort;
}
function dropDepartmentSummaryEcho(items) {
  return (items || []).filter(it => !isDepartmentSummaryEcho(it));
}

// 2026-07-03补充：name本身是"彩超""小结"这类通用类别/栏目泛称（不是"腹部彩超"/"甲状腺彩超"这种具体检查名），
// 内容要么是纯科普说明文字（"小的结石不出现症状时可不处理..."，跟报告详细报告单里的具体检查所见完全重复，
// 该患者的真实所见已经体现在归类正确的详细报告单条目里，如"双肾输尿管膀胱彩超"），要么内容极简空洞
// （只有"未见异常"四个字，没有对应任何具体检查项目）。matchStatus必为unclassified作安全网，
// 真实检查项目一定有具体名称且能归类，泛称+无实质内容的组合才会漏网到这里。
const GENERIC_LABEL_NAMES = new Set(['彩超', '小结', '汇总', '总结', '检查结果', '异常结果', 'B超']);
function isGenericLabelEcho(it) {
  if (it.matchStatus !== 'unclassified') return false;
  const name = str(it.name);
  if (!GENERIC_LABEL_NAMES.has(name)) return false;
  const text = `${str(it.findings)}${str(it.diagnosis)}`;
  const hasMeasurement = /\d+\s*[×xX]\s*\d+|CDFI|mm|cm|C-TIRADS/.test(text);
  return !hasMeasurement;
}
function dropGenericLabelEcho(items) {
  return (items || []).filter(it => !isGenericLabelEcho(it));
}

function isNumberedSummaryEcho(it) {
  const name = str(it.name);
  if (!name) return false;
  const findings = str(it.findings);
  const diagnosis = str(it.diagnosis);
  const isNumbered = /^\d+\s*[、.．:：]/.test(findings) || /^\d+\s*[、.．:：]/.test(diagnosis);
  if (!isNumbered) return false;
  const stripNum = (s) => s.replace(/^\d+\s*[、.．:：]\s*/, '').trim();
  return stripNum(findings) === name || stripNum(diagnosis) === name;
}
function dropNumberedSummaryEcho(items) {
  return (items || []).filter(it => !isNumberedSummaryEcho(it));
}

// 有些诊断/发现片段（如"左肾结石""窦性心动过缓；左心室高电压；T波改变""杯盘比"）会被单独提取成一条，
// 而不是作为某个真实检查项目（双肾输尿管膀胱彩超/心电图/双眼眼底照相等）的诊断内容——这类假条目没有编号前缀，
// 单靠内容判断风险高（容易误伤真实检查项目，比如"裂隙灯检查"的findings也经常直接以name开头）。
// 用"分类失败(不是真实检查项目名) + findings基本等于name本身"两个条件一起卡，双重门槛降低误删风险：
// 真实检查项目一定能在归类库里找到对应节点，只有这种"诊断片段被误当项目名"的假条目才会同时满足两个条件。
// 必须放在 classifyItemsAsync 之后调用，依赖 matchStatus 字段。
function isUnclassifiedNameEcho(it) {
  if (it.matchStatus !== 'unclassified') return false;
  const name = str(it.name);
  if (!name || name.length < 3) return false;
  const stripNum = (s) => s.replace(/^\d+\s*[、.．:：]\s*/, '').trim();
  const findings = stripNum(str(it.findings));
  const diagnosis = stripNum(str(it.diagnosis));
  const checkField = (field) => {
    if (!field.startsWith(name)) return false;
    return field.slice(name.length).trim().length <= 20; // 前缀匹配后只剩很短的补充内容（如分级标签）才算
  };
  return checkField(findings) || checkField(diagnosis);
}
function dropUnclassifiedNameEcho(items) {
  return (items || []).filter(it => !isUnclassifiedNameEcho(it));
}

// 2026-07-03：运动处方/热身放松环节说明（如"放松（包括拉伸）" value="5-10分钟" unit="分钟"）
// 会被AI当成一条独立检验数据提取，实际是运动指导科普话术里的步骤条目。
// 用"分类失败 + 单位是时长单位(分钟/秒/组/次)"双重门槛判定：真实检验/检查项目一定能归类，
// 且几乎不会用"分钟/组/次"做计量单位，两者同时满足才判定为运动指导话术，避免误伤真实项目。
function isExerciseGuideEcho(it) {
  if (it.matchStatus !== 'unclassified') return false;
  const unit = str(it.unit);
  if (!/^(分钟|秒|分|组|次)$/.test(unit)) return false;
  const value = str(it.value);
  return /^\d+\s*[-~]?\s*\d*\s*(分钟|秒|分|组|次)?$/.test(value);
}
function dropExerciseGuideEcho(items) {
  return (items || []).filter(it => !isExerciseGuideEcho(it));
}

// 2026-07-02：胃镜/肠镜病理不再要求AI自己判断"是否要拆成第二条独立记录"（这对模型太难，经常内容窜位或漏掉），
// 改成AI只需原样抄写pathologyFindings/pathologyDiagnosis两个候选字段（没有就留空），
// 由代码确定性地拆出"胃镜病理"/"肠镜病理"独立记录——是否拆分不再依赖模型的语义判断，只看这两个字段是否非空。
function splitEndoscopyPathology(items) {
  const result = [];
  (items || []).forEach(it => {
    const pf = str(it.pathologyFindings);
    const pd = str(it.pathologyDiagnosis);
    const { pathologyFindings, pathologyDiagnosis, ...rest } = it;
    if (!pf && !pd) { result.push(rest); return; }
    // 判断胃镜/肠镜必须看病理内容本身（"胃窦""胃黏膜""贲门""幽门"等胃部关键词），不能看外层记录的name——
    // 外层name可能是"消化内镜检查""病理科检查"这类科室汇总标题，不含"胃"字，会导致误判成肠镜病理
    const pathologyText = `${pf}${pd}`;
    const isGastro = /胃窦|胃黏膜|胃体|胃角|贲门|幽门|胃底/.test(pathologyText) || /胃/.test(str(it.name));
    // AI有时把整条记录本身就识别成了独立的病理报告（name本身是"病理组织诊断报告"这类病理标题，
    // findings/diagnosis已经等同于pathologyFindings/pathologyDiagnosis），这种情况不需要再拆出第二条，
    // 只需原地改名规范化，否则会产生内容一字不差的两条重复记录
    const isSelfPathology = str(it.findings) === pf && str(it.diagnosis) === pd;
    if (isSelfPathology) {
      result.push({ ...rest, name: isGastro ? '胃镜病理' : '肠镜病理' });
      return;
    }
    result.push(rest);
    result.push({
      ...rest,
      name: isGastro ? '胃镜病理' : '肠镜病理',
      value: '', unit: '', referenceRange: '', status: 'unknown', orderName: '', bodyPart: '',
      findings: pf,
      diagnosis: pd,
      conclusion: pd,
    });
  });
  return result;
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

// 2026-07-02：超声"AI整体抄写+代码字符串切分"方案(splitUltrasoundByOrgan)实测比"AI自己按器官拆分"更不稳定
// （findings/diagnosis分别独立切分、常对不上，内容窜位；且这次AI连"整体抄写"都没做到，把全部器官压缩成一条），
// 已回退为基线方案：prompt要求AI自己按器官拆分，代码只负责识别+清理"异常结果汇总页把多器官压缩成一条"的重复echo。
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
    // 2026-07-03修复：orderNameCount.get(name)在这个name从未被别的记录当orderName共享过时返回
    // undefined，"undefined < 2"在JS里恒为false（不会被当成0处理），导致条件误判"满足重复"，
    // 继续往下走到"value是否为空"分支——几乎所有imaging类型记录(超声/心电图等，靠findings/diagnosis
    // 描述而非value数值)都会被误判成"看起来像空洞的套餐标题"整条删除。加"|| 0"兜底修正。
    if (!name || (orderNameCount.get(name) || 0) < 2) return true;
    // 2026-07-03修复：规则1原本只要"name跟共享orderName同名且出现≥2次"就丢弃，用来清理AI把套餐标题
    // 当独立项目重复吐出来的情况（如"肿瘤六项男"被当成具体项目名出现3次，这类每条都没有具体数值）。
    // 但潘孝银2023-05-27报告"血细胞分析"检验单8个子项被AI错误地把name都写成了套餐标题"血细胞分析"，
    // 而value字段其实各自都有具体检验数值（"3.71*10^9/L"等）——这种情况丢弃就会把真实数据一起清空。
    // 用value是否有实质内容做区分：有具体数值说明这是真实子项（name打错了但数据是真的），不丢弃；
    // value为空才是真正空洞的套餐标题重复行，按原逻辑丢弃。
    return !!str(it.value); // 规则1
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

  // 2026-07-03修复：richness/stripAdvisorySuffix 定义提前到规则3也能用——计算信息量前先剔除
  // "意义：""建议："开头的科普/建议性文字，这类通用医学教育模板文本常见于"体检异常结果及说明"这类
  // 多检查项汇总摘要页，会让摘要页的字数"注水"。字段是否有值(用于*5加分)仍看原始内容，不受剔除影响。
  const stripAdvisorySuffix = s => str(s).replace(/(意义|建议)[：:][\s\S]*$/, '').trim();
  const richness = o => stripAdvisorySuffix(o.findings).length + stripAdvisorySuffix(o.diagnosis).length + stripAdvisorySuffix(o.conclusion).length
    + ['referenceRange', 'orderName', 'findings', 'diagnosis', 'conclusion', 'bodyPart'].filter(f => str(o[f])).length * 5;

  // 统计每个orderName在去重前全部记录里出现的次数——一份检验单通常包含多个子项，会被多条记录共享
  // 同一个orderName；而摘要页("体检异常结果及说明"类汇总页)提取出的记录，orderName常是AI临时编造的
  // 模糊词(如"免疫指标")，在整份报告里往往只出现这一次。用复用频率能可靠区分"真实检验单名"和
  // "摘要页编造名"，比靠字符串长度或关键词黑名单猜测更站得住脚。
  const orderNameFreq = new Map();
  afterRule2.forEach(it => {
    const on = str(it.orderName);
    if (on) orderNameFreq.set(on, (orderNameFreq.get(on) || 0) + 1);
  });

  const dedupMap = new Map();
  const scoreCompleteness = o => ['referenceRange', 'orderName', 'findings', 'diagnosis', 'conclusion', 'bodyPart']
    .filter(f => str(o[f])).length;
  const result = [];
  afterRule2.forEach(it => {
    const key = `${it.itemType}|${str(it.name)}|${str(it.value)}|${str(it.unit)}`;
    if (!dedupMap.has(key)) { dedupMap.set(key, result.length); result.push(it); return; }
    const idx = dedupMap.get(key);
    const c1 = scoreCompleteness(it), c0 = scoreCompleteness(result[idx]);
    // 字段数量打平时（如两条记录都填了findings/diagnosis/conclusion三个字段），用信息量(richness)做决胜局——
    // 此前打平就默认保留先出现的那条，导致摘要页记录（页码靠前）压过详细报告单记录（页码靠后）
    const winner = (c1 > c0 || (c1 === c0 && richness(it) > richness(result[idx]))) ? it : result[idx]; // 规则3
    // 2026-07-03修复：orderName单独按复用频率取更可信的一个，不因为内容更丰富的一方"赢了"就连带
    // 覆盖掉另一方更准确的orderName——如摘要页那条补体4带着findings/diagnosis文本、内容分更高而"赢"，
    // 但它的orderName="免疫指标"是编造的、报告里只出现1次，详细检验单那条orderName="免疫五项"被
    // 补体3/补体4/免疫球蛋白ABC共5条记录共享、复用次数更高，应该保留后者，否则这条记录会脱离它
    // 真正所属的检验单分组，看起来像是"从免疫五项里消失了"。
    const onA = str(it.orderName), onB = str(result[idx].orderName);
    const freqA = orderNameFreq.get(onA) || 0, freqB = orderNameFreq.get(onB) || 0;
    const betterOrderName = freqA >= freqB ? onA : onB;
    result[idx] = winner.orderName === betterOrderName ? winner : { ...winner, orderName: betterOrderName };
  });

  // 规则4：同名但数值不同的重复行（如"尿液干化学分析"一次只提到尿隐血异常、另一次把11项明细都写全）——
  // 同一次体检里同名项目出现两次基本都是同一处内容被分两页/两批次各提取了一遍，保留信息量更大的一条
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

  // 规则6（2026-07-03新增）：跨检验单/套餐的重复——同一份检验项目有时会同时出现在"体检异常结果及说明"
  // 摘要页(名字较短)和后面详细检验单页面(名字可能多带"测定"等后缀、所属orderName也不同，如"血脂全套"
  // 和"血脂四项"两个不同订单里都有"血清高密度脂蛋白胆固醇")。规则1-4都要求name（或name::orderName）
  // 完全相同才归为一组，认不出这类只差几个字后缀、或跨订单出现的重复，导致漏网。
  // 这里只在itemType=lab、且"去掉常见检验后缀词后的name + 数值 + 单位"三者都完全相同时才判定为真
  // 重复并自动去重（双重确认：名字近似 + 数值也一致），避免误伤"名字相似但确实是两次不同检验"的情况；
  // 名字相同但数值不同的重复（如同一项目两次结果不一样）不在这里处理，两条都保留，交给医护人工核对。
  const stripLabSuffix = (name) => str(name).replace(/(测定|检测|定量|半定量|分析|测量)$/g, '').trim();
  const dedupMap6 = new Map();
  const drop6 = new Set();
  final.forEach((it, idx) => {
    if (it.itemType !== 'lab') return;
    const v = str(it.value);
    if (!v) return; // 空值不参与这层去重，避免误伤真实的空值占位记录
    const key = `${stripLabSuffix(it.name)}|${v}|${str(it.unit)}`;
    if (!dedupMap6.has(key)) { dedupMap6.set(key, idx); return; }
    const existIdx = dedupMap6.get(key);
    if (richness(final[idx]) > richness(final[existIdx])) {
      drop6.add(existIdx);
      dedupMap6.set(key, idx);
    } else {
      drop6.add(idx);
    }
  });
  final = final.filter((_, idx) => !drop6.has(idx));

  return final;
}

// 2026-07-03补充：眼压/视力/电耳镜等检查偶发 diagnosis/conclusion 被AI写成只剩编号（前面有时还带
// "小结："这个前缀）、没有实际结论文字的残缺格式（如"1、""小结：1、"），而同一条记录的 findings 字段
// 其实是完整的（如"右:12mmHg；左:14mmHg"）。判定为"(可选'小结：'前缀)+编号+其后要么为空、要么只有
// 极短的标点/空白"才回填，避免误伤"小结：1、未见异常""1、各心腔大小...未见明显异常"这种编号后面
// 跟着完整内容的正常写法。
function fillEmptyDiagnosisFromFindings(items) {
  const isNumberOnly = (s) => /^(小结[：:]\s*)?\d+\s*[、.．:：]\s*$/.test(str(s));
  return (items || []).map(it => {
    const findings = str(it.findings);
    if (!findings) return it;
    const patch = {};
    if (isNumberOnly(it.diagnosis)) patch.diagnosis = findings;
    if (isNumberOnly(it.conclusion)) patch.conclusion = findings;
    return Object.keys(patch).length ? { ...it, ...patch } : it;
  });
}

// 按 key（格式 <L1的_id>|<L2名字>|<叶子名字>）upsert 一条 UserScreeningItem，AI自动归类和医护手动录入共用此函数。
// 2026-07-02修复：查询条件补上 reportId，让同一 itemId 在不同报告（不同年份）下各自保留一条独立记录，
// 而不是互相覆盖——模型索引早已是 {user,itemId,reportId} 三元唯一，此前查询条件只用了前两个字段，
// 导致新报告审核会把旧报告（如2024年）已经写入的同 itemId 记录覆盖掉，历史年份数据丢失。
async function upsertScreeningKey(userId, reportId, key, fallbackName) {
  const parts = String(key).split('|');
  await UserScreeningItem.updateOne(
    { user: userId, itemId: key, reportId },
    { $set: { category: parts[0] || '', parentLabel: parts[1] || '', itemLabel: parts[2] || fallbackName || '', status: 'completed' } },
    { upsert: true }
  );
}

// 将报告已归类项同步写入 UserScreeningItem（upsert，同一 itemId 按 reportId 各自保留一条，支持多年数据并存）
// 2026-07-09（用户决策"一项只归一类"）：每个检验项只写【一条】——优先医护在审核弹窗确认的单值 screeningKey，
// 回退 screeningKeys 数组的第一个（最佳匹配）。不再对 AI 多匹配出的每个 screeningKey 都写一条，
// 从根上消除金娟反馈的"专项筛查里多出 AI 单独生成的部分"（如球蛋白同时被写进肝功能+免疫球蛋白两处）。
async function syncScreeningItems(userId, reportId, items) {
  try {
    const matched = (items || []).filter(it => it.matchStatus === 'matched');
    let syncCount = 0;
    for (const it of matched) {
      // 单一归类键：人工确认值最优先，其次数组首位（最佳匹配），都没有则跳过
      const key = it.screeningKey || (it.screeningKeys && it.screeningKeys[0]) || '';
      if (!key) continue;
      await upsertScreeningKey(userId, reportId, key, it.name);
      syncCount++;
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

// 血常规是全国最标准化的检验套餐之一，项目基本固定，但检验单标题常写成"血细胞分析"这类不带"N项"
// 数字后缀的名字，findUnderExtractedPages 靠标题解析条数的机制覆盖不到，只能用一份预期项目清单兜底。
// 每组用"其中一个变体名出现即算命中"，兼容不同机构的缩写/全称差异。
const CBC_EXPECTED_GROUPS = [
  ['白细胞计数', 'WBC'],
  ['中性粒细胞绝对值', 'GR#', 'NEUT#'],
  ['中性粒细胞百分比', 'GR%', 'NEUT%'],
  ['淋巴细胞绝对值', 'LY#'],
  ['淋巴细胞百分比', 'LY%'],
  ['单核细胞绝对值', 'MO#', 'MON#'],
  ['单核细胞百分比', 'MO%', 'MON%'],
  ['嗜酸性粒细胞绝对值', 'EO#'],
  ['嗜酸性粒细胞百分比', 'EO%'],
  ['红细胞计数', 'RBC'],
  ['血红蛋白', 'HGB'],
  ['血小板计数', 'PLT'],
];
// 判断一批条目里，是否已经出现了血常规特征项（用来确认这份报告确实有血常规检验单，而不是对没做过血常规的报告瞎报缺项）
function hasCbcAnchor(items) {
  return (items || []).some(it => /白细胞计数|血红蛋白\(HGB\)|WBC|血细胞分析/.test(str(it.name)));
}
function findUnderExtractedCBC(items) {
  if (!hasCbcAnchor(items)) return { pagesToRetry: [], missingGroups: [] };
  const names = (items || []).map(it => str(it.name));
  const missingGroups = CBC_EXPECTED_GROUPS.filter(variants => !variants.some(v => names.some(n => n.includes(v))));
  if (!missingGroups.length) return { pagesToRetry: [], missingGroups: [] };
  // 缺项通常发生在血常规检验单的跨页续写处，取所有命中"血细胞分析/血常规"特征名的条目所在页，一并重试
  const pages = new Set(
    (items || []).filter(it => /白细胞计数|血红蛋白\(HGB\)|WBC|血细胞分析|中性粒细胞|淋巴细胞|单核细胞|嗜酸性粒细胞|嗜碱性粒细胞|红细胞计数|血小板计数/.test(str(it.name)))
      .map(it => it._page).filter(Boolean)
  );
  return { pagesToRetry: [...pages], missingGroups: missingGroups.map(g => g[0]) };
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
  const { fetchReportBuffer, fetchReportBuffers, pdfBufferToImages, isPdfReport, renderSinglePage } = require('../utils/pdf');
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
      // 血常规标准项目清单核对+单页重试：检验单标题（如"血细胞分析"）不带"N项"数字后缀，
      // 上面按标题解析条数的机制覆盖不到，改用固定项目清单比对是否缺项（详见 findUnderExtractedCBC 注释）
      const CBC_NAME_PATTERN = /白细胞计数|血红蛋白\(HGB\)|WBC|血细胞分析|中性粒细胞|淋巴细胞|单核细胞|嗜酸性粒细胞|嗜碱性粒细胞|红细胞计数|血小板计数|红细胞比积|平均红细胞|血小板比积|血小板体积|大血小板比率|红细胞分布宽度|红细胞体积分布宽度/;
      const { pagesToRetry: cbcRetryPages, missingGroups } = findUnderExtractedCBC(allItems);
      if (cbcRetryPages.length) {
        console.log(`[parse-ai] 血常规缺项核对不通过 ${reportId}：缺少${missingGroups.join('、')}，重试页${cbcRetryPages.join(',')}`);
        for (const pageNum of cbcRetryPages) {
          try {
            const img = await renderSinglePage(pdfBuf, pageNum, DPI);
            if (!img) continue;
            const retryPrompt = REPORT_PARSE_PROMPT + `\n\n【补充提醒】本页的血常规/血细胞分析检验单曾漏提了部分子项（缺少：${missingGroups.join('、')}）。请重新逐行核对该检验单在图片中的每一行，血常规通常有白细胞、中性粒细胞、淋巴细胞、单核细胞、嗜酸性粒细胞、嗜碱性粒细胞、红细胞、血红蛋白、血小板等约20项子指标（含绝对值和百分比两种），必须逐条全部输出，不得省略或遗漏任何一行。`;
            const text = await parseImage(img, retryPrompt, { isUrl: false, model: VL_MODEL, maxTokens: 4096 });
            const p = safeParseJSON(text);
            if (!p || !Array.isArray(p.items)) continue;
            const retryItems = p.items.filter(it => it.name && String(it.name).trim()).map(it => ({ ...it, _page: pageNum }));
            const retryCbcItems = retryItems.filter(it => CBC_NAME_PATTERN.test(str(it.name)));
            const oldCbcCountOnPage = allItems.filter(it => it._page === pageNum && CBC_NAME_PATTERN.test(str(it.name))).length;
            if (retryCbcItems.length > oldCbcCountOnPage) {
              allItems = allItems.filter(it => !(it._page === pageNum && CBC_NAME_PATTERN.test(str(it.name)))).concat(retryCbcItems);
              console.log(`[parse-ai] 页${pageNum}血常规重试生效：血常规条目 ${oldCbcCountOnPage}→${retryCbcItems.length}`);
            } else {
              console.log(`[parse-ai] 页${pageNum}血常规重试未改善，保留原结果`);
            }
          } catch (e) {
            console.log(`[parse-ai] 页${pageNum}血常规重试异常: ${e.message}`);
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

      // 体格检查类内容为空重试：眼压等体格检查项目偶尔被提取成空壳(findings/diagnosis均为空)，
      // 大概率是模型在长报告+多任务prompt下的遗漏(概率性问题，非稳定复现的规则漏洞)，重试一次这一页争取补全，不强求一定成功
      const emptyExamPages = [...new Set(
        allItems.filter(it => PHYSICAL_EXAM_NAMES.some(n => str(it.name).startsWith(n)) && !str(it.findings) && !str(it.diagnosis)).map(it => it._page)
      )].filter(Boolean);
      for (const pageNum of emptyExamPages) {
        try {
          const img = await renderSinglePage(pdfBuf, pageNum, DPI);
          if (!img) continue;
          const emptyNames = allItems.filter(it => it._page === pageNum && PHYSICAL_EXAM_NAMES.some(n => str(it.name).startsWith(n)) && !str(it.findings) && !str(it.diagnosis)).map(it => it.name);
          const retryPrompt = REPORT_PARSE_PROMPT + `\n\n【补充提醒】本页曾提取到"${emptyNames.join('、')}"项目但检查所见/诊断意见内容为空，请重新核对该项目在图片中的具体内容，完整填写findings和diagnosis字段，不要留空。`;
          const text = await parseImage(img, retryPrompt, { isUrl: false, model: VL_MODEL, maxTokens: 4096 });
          const p = safeParseJSON(text);
          if (!p || !Array.isArray(p.items)) continue;
          const retryItems = p.items.filter(it => it.name && String(it.name).trim()).map(it => ({ ...it, _page: pageNum }));
          let improvedNames = [];
          emptyNames.forEach(n => {
            const retryMatch = retryItems.find(it => str(it.name).startsWith(n) && (str(it.findings) || str(it.diagnosis)));
            if (retryMatch) improvedNames.push(n);
          });
          if (improvedNames.length) {
            allItems = allItems.filter(it => !(it._page === pageNum && improvedNames.some(n => str(it.name).startsWith(n))))
              .concat(retryItems.filter(it => improvedNames.some(n => str(it.name).startsWith(n))));
            console.log(`[parse-ai] 页${pageNum}空内容重试生效：${improvedNames.join('、')} 已补全`);
          } else {
            console.log(`[parse-ai] 页${pageNum}空内容重试未改善，保留原结果`);
          }
        } catch (e) {
          console.log(`[parse-ai] 页${pageNum}空内容重试异常: ${e.message}`);
        }
      }

      // 2026-07-02修复：各类单页重试(数量核对/超声拆分/空内容补全)命中后都是把条目从原位置摘掉、
      // 用 .concat() 拼到 allItems 末尾，导致这些条目脱离了报告原文的页码顺序、被甩到审核列表最后面，
      // 跟同页其他体格检查项目（如内科/外科/眼科）在报告原文里连续排列的顺序对不上，审核时容易漏看。
      // 这里按页码做一次稳定排序（sort 保证同页内原有相对顺序不变），让最终顺序重新贴近报告原文顺序。
      allItems.sort((a, b) => (a._page || 0) - (b._page || 0));
      allItems = allItems.map(({ _page, ...rest }) => rest); // 内部字段，落库前去掉

      // 2026-07-03修复：splitEndoscopyPathology 挪到 cleanupExtractedItems 去重之前执行——
      // 多页报告里，胃镜/肠镜的"检查所见"页和"病理报告"页常常canonicalize成同一个名字(如都叫"胃镜检查")，
      // 若先去重(同名只保留信息量最大的一条)，病理内容会被当"重复"整条丢弃，splitEndoscopyPathology
      // 根本没机会把它拆成独立的"胃镜病理"记录。先拆分让病理内容换成不同的名字("胃镜病理")，
      // 就不会再跟检查记录同名竞争，去重规则只需要在真正重复的记录间挑选，不会误伤互补信息。
      const filteredItems = fillEmptyDiagnosisFromFindings(cleanupUltrasoundOverlap(mergeEntSubparts(cleanupExtractedItems(splitEndoscopyPathology(dropNumberedSummaryEcho(dropDepartmentSummaryEcho(dropAdvisoryEcho(filterPatientInfoItems(allItems)))))))));
      const classified = dropGenericLabelEcho(dropResultCommentEcho(dropDiagnosisPhraseEcho(dropExerciseGuideEcho(dropUnclassifiedNameEcho(await classifyItemsAsync(filteredItems))))));
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

    // 图片：统一取文件 buffer 转 base64（兼容 content / OSS / 本地路径）。fileUrls 存在多张图片时
    // （一份报告被拍成多张照片，如"结论页"+"数据页"），一次性把全部图片传给AI合并识别成一份结果。
    const bufs = report.fileUrls && report.fileUrls.length ? await fetchReportBuffers(report, UPLOADS_DIR) : [await fetchReportBuffer(report, UPLOADS_DIR)];
    let text, parsed;
    try {
      const imgSources = bufs.map(b => b.toString('base64'));
      text = await parseImage(imgSources.length > 1 ? imgSources : imgSources[0], REPORT_PARSE_PROMPT, { isUrl: false, model: 'qwen-vl-plus', maxTokens: 4096 });
      parsed = safeParseJSON(text);
    } catch (e) {
      console.log(`[parse-ai] 图片解析异常 ${reportId}: ${e.message}`);
    }
    const classifiedImg = dropGenericLabelEcho(dropResultCommentEcho(dropDiagnosisPhraseEcho(dropExerciseGuideEcho(dropUnclassifiedNameEcho(await classifyItemsAsync(fillEmptyDiagnosisFromFindings(cleanupUltrasoundOverlap(mergeEntSubparts(cleanupExtractedItems(splitEndoscopyPathology(dropNumberedSummaryEcho(dropDepartmentSummaryEcho(dropAdvisoryEcho(filterPatientInfoItems(parsed?.items || [])))))))))))))));
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
    const { isFunctionalMedicineL1 } = require('../utils/screeningMatch');
    if (await isFunctionalMedicineL1(report.screeningL1)) {
      await MedicalReport.findByIdAndUpdate(report._id, { aiStatus: 'pending' });
      return res.json({ success: true, message: '功能医学检测报告不支持AI自动解析（项目繁多或页数过大），请人工查阅原始文件' });
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

// GET /api/staff/screening-catalog — 专项筛查归类下拉
// 2026-07-02重写：此前直接从 LabTestPackage 套餐读取，value 格式用 L1名字拼接（<L1name>|<pkgName>|<itemName>），
// 既漏读了挂在 orders(检验医嘱) 下的子项目（只读了 labTestItems），跟 AI 自动归类(screeningMatch.js 里
// classifyItemsAsync 产出的 screeningKey，格式 <L1的_id>|<L2名字>|<叶子节点名字>) 也完全不一致——两边各自维护
//一份"归类选项"，导致 admin 分类管理里配置好的分类，AI 归类能用但医护端搜不到。
// 现改为：只读 ProjectCategory 本身（叶子节点=末级分类），按 classifyItemsAsync 完全相同的公式拼 value，
// 保证两边 key 一致才能互认/去重。不复用 screeningMatch.js 内部的 buildAdminIndex 函数，避免为了这个展示需求
// 改动 AI 归类核心逻辑依赖的共享代码——本路由改动完全独立、出问题只影响这一个下拉框，不影响 AI 自动归类主流程。
// 展示文字额外带上该叶子节点直接挂载(categoryId)的检验医嘱/检查医嘱/功能医学检测名称，方便医护辨认。
router.get('/screening-catalog', staffAuth, async (req, res) => {
  try {
    const [cats, orders, exams, funcTests] = await Promise.all([
      ProjectCategory.find({ status: 'active' }).select('name parent').lean(),
      LabTestOrder.find({ status: 'active', categoryId: { $ne: null } }).select('name categoryId').lean(),
      SpecialExam.find({ status: 'active', deleted: { $ne: true }, categoryId: { $ne: null } }).select('name categoryId').lean(),
      FunctionalMedicineTest.find({ status: 'active', deleted: { $ne: true }, categoryId: { $ne: null } }).select('name categoryId').lean(),
    ]);

    // 按分类节点_id聚合直接挂载的检验医嘱/检查医嘱/功能医学检测名称，供选项展示辅助文字用
    const namesByCat = new Map();
    [...orders, ...exams, ...funcTests].forEach(item => {
      const key = String(item.categoryId);
      if (!namesByCat.has(key)) namesByCat.set(key, []);
      namesByCat.get(key).push(item.name);
    });

    const byId = new Map(cats.map(c => [String(c._id), c]));
    const childCount = new Map();
    cats.forEach(c => { if (c.parent) childCount.set(String(c.parent), (childCount.get(String(c.parent)) || 0) + 1); });
    const isLeaf = c => !(childCount.get(String(c._id)) > 0);

    // 排除"功能检测/功能医学"类L1，跟AI归类(buildAdminIndex)规则保持一致，这类只能人工在OCR审核弹窗手动选
    const excludeL1Ids = new Set(cats.filter(c => !c.parent && /功能检测|功能医学/.test(c.name)).map(c => String(c._id)));

    const groupsByL1 = new Map();
    cats.filter(isLeaf).forEach(leaf => {
      // 找L1祖先 + 直接父级名字，跟 screeningMatch.js buildAdminIndex 里 resolveAncestry 逻辑一致
      // 2026-07-02：加断链检测——若父级被停用/删除(不在active的cats里)，不能把这个节点自己误判成L1，
      // 那样会导致它脱离原本分组、变成一个只有自己一条的"伪分类"，人工搜索时结构错乱难以定位。
      // 曾经真实发生过：拆分"身高/体重/BMI/脉搏"时误挂到了停用节点下，这几项因此从"一般检查"分组里消失。
      let l1 = leaf, parentLabel = leaf.name;
      let cur = leaf;
      const chain = [];
      let brokenChain = false;
      while (cur.parent) {
        if (!byId.has(String(cur.parent))) { brokenChain = true; break; }
        const p = byId.get(String(cur.parent));
        chain.unshift(p); cur = p;
      }
      if (brokenChain) {
        console.error(`[screening-catalog] 分类"${leaf.name}"(${leaf._id})父级链路断裂，已排除，需在admin后台重新挂到正确分类下`);
        return;
      }
      if (chain.length) { l1 = chain[0]; parentLabel = chain[chain.length - 1].name; }
      const l1Id = String(l1._id);
      if (excludeL1Ids.has(l1Id)) return;

      const extraNames = [...new Set(namesByCat.get(String(leaf._id)) || [])];
      const displaySuffix = extraNames.length ? ` (${extraNames.join('、')})` : '';
      const value = `${l1Id}|${parentLabel}|${leaf.name}`;
      if (!groupsByL1.has(l1.name)) groupsByL1.set(l1.name, []);
      groupsByL1.get(l1.name).push({
        value,
        label: `${parentLabel !== leaf.name ? parentLabel + ' / ' : ''}${leaf.name}${displaySuffix}`,
        groupLabel: l1.name,
      });
    });

    const groups = [...groupsByL1.entries()].map(([label, opts]) => ({ label, opts }));
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
// 只有营养师/超管可生成营养干预方案（用户规则：营养方案只归营养师负责）
router.post('/patients/:id/ai-nutrition-plan', staffAuth, async (req, res) => {
  if (!['nutritionist', 'superadmin'].includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '仅营养师可生成营养干预方案' });
  }
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

// AI生成的体检方案项目名称是自由文本，容易跟admin后台"检验医嘱/检查医嘱/功能医学检测"库对不上、
// 产生同义词不一致（如AI写"甲状腺抗体TPO"而库里叫别的名字），导致体检项目在系统里管理凌乱。
// 生成后按名称匹配医嘱库，命中的关联itemId/itemType（与手动添加AddItemPanel走同一套关联字段），
// 未命中的保留纯文本但不关联，医护专员审核时能一眼看出哪些需要人工核对。
async function matchCheckupItemsToRequisitionLibrary(items) {
  const [labOrders, specialExams, functionalTests] = await Promise.all([
    LabTestOrder.find({ status: 'active' }).select('name mnemonic').lean(),
    SpecialExam.find({ status: 'active', deleted: { $ne: true } }).select('name mnemonic').lean(),
    FunctionalMedicineTest.find({ status: 'active', deleted: { $ne: true } }).select('name').lean(),
  ]);
  const library = [
    ...labOrders.map(o => ({ _id: o._id, name: o.name, itemType: 'labTest' })),
    ...specialExams.map(e => ({ _id: e._id, name: e.name, itemType: 'specialExam' })),
    ...functionalTests.map(f => ({ _id: f._id, name: f.name, itemType: 'functionalTest' })),
  ];
  // 去除括号符号(保留括号内文字，那常是关键信息)和常见修饰性噪声词后归一化，供相似度打分——
  // 2026-07-07 用户给出3个具体反例：AI"胸部低剂量CT" vs 库"胸部（低剂量螺旋）CT"、
  // AI"骨密度检测（双能X线法，腰椎+股骨颈）" vs 库"双能x线骨密度"（词序完全颠倒）、
  // AI"妇科超声（经阴道）" vs 库"阴道超声"——字面顺序/括号修饰差异很大，简单includes子串匹配覆盖不了。
  const NOISE_WORDS = ['检测', '检查', '化验', '法', '科', '经'];
  const normalize = (s) => {
    let t = s.replace(/[（）()，,、+\s]/g, '');
    NOISE_WORDS.forEach(w => { t = t.split(w).join(''); });
    return t.toLowerCase();
  };
  // 最长公共子序列长度：衡量"顺序一致的核心内容重合度"（如"胸部低剂量CT"→"胸部低剂量螺旋CT"）
  function lcsLength(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    return dp[m][n];
  }
  // 多重集合交集（计数式）：衡量"字都在但顺序打乱"的情况（如"经阴道超声"vs"阴道超声"）
  function multisetOverlap(a, b) {
    const count = {};
    for (const ch of a) count[ch] = (count[ch] || 0) + 1;
    let inter = 0;
    for (const ch of b) { if (count[ch] > 0) { inter++; count[ch]--; } }
    return inter;
  }
  // 取LCS和多重集合交集中较高者：两种匹配方式分别覆盖"顺序一致"和"词序打乱"两类真实场景
  const similarityScore = (a, b) => {
    if (!a || !b) return 0;
    return Math.max(lcsLength(a, b), multisetOverlap(a, b)) / Math.min(a.length, b.length);
  };
  return items.map(item => {
    const name = (item.name || '').trim();
    if (!name) return item;
    // 1) 精确匹配
    const exact = library.find(l => l.name === name);
    if (exact) return { ...item, itemId: exact._id, itemType: exact.itemType };
    // 2) 双向包含匹配（如AI写"甲状腺功能"能匹配库里"甲状腺功能五项"）
    const partial = library.find(l => l.name.includes(name) || name.includes(l.name));
    if (partial) return { ...item, itemId: partial._id, itemType: partial.itemType };
    // 3) 归一化后相似度打分，取最高分且超过阈值（0.75）的一项——
    // 阈值不宜过低，避免"血常规"误配到"尿常规"这类同字数但语义不同的项目（实测两者分数为0.67）
    const normName = normalize(name);
    let best = null, bestScore = 0;
    library.forEach(l => {
      const s = similarityScore(normName, normalize(l.name));
      if (s > bestScore) { bestScore = s; best = l; }
    });
    if (best && bestScore >= 0.75) return { ...item, itemId: best._id, itemType: best.itemType };
    return item;
  });
}

// ── 场景6：AI年度体检方案（健管专员审核） ──────────────────────────────────────
// POST /api/staff/patients/:id/ai-annual-checkup-plan
// 创建 HealthPlan type='annual_checkup' status='draft' content.aiStatus='pending'
// 只有家庭医生/超管可生成年度体检方案（跟年度管理方案同一条用户规则）
router.post('/patients/:id/ai-annual-checkup-plan', staffAuth, async (req, res) => {
  if (!['familyDoctor', 'superadmin'].includes(req.staff.role)) {
    return res.status(403).json({ success: false, message: '仅家庭医生可生成年度体检方案' });
  }
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

    const riskYears = Object.keys(riskByYear(user.aiRiskAssessment)).sort((a, b) => Number(b) - Number(a));
    const riskSummary = (riskYears.length ? riskByYear(user.aiRiskAssessment)[riskYears[0]]?.overallSummary : null) || '未进行AI风险评估';

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
- 【重要】每条 items 必须是单一独立的检验/检查项目，禁止用"+""、""，"等符号把多个项目合并写进一个name
  里（如"空腹血糖+糖化血红蛋白"必须拆成两条独立记录：一条name="空腹血糖"，一条name="糖化血红蛋白"）。
  这是因为每条方案项目后续要跟admin后台的检验/检查医嘱库逐项精确关联，合并写法无法准确关联到具体医嘱。
- 常规体检必选：血常规、生化全套、血糖、血脂、甲状腺功能（含TSH，如涉及多指标请逐项拆开列出）、尿常规
- 根据慢病标签增加专项：桥本/甲减→甲状腺抗体TPO/TgAb+甲状腺超声（拆成独立条目）；高血压→心电图+颈动脉超声（拆成独立条目）；糖尿病→HbA1c+眼底检查（拆成独立条目）
- 年龄>40建议：肿瘤标志物（AFP/CEA/CA125等，逐项拆开）、胸部低剂量CT
- 项目数量不设硬性上限，按需覆盖，不要为了凑数或减少条数而合并项目名；scheduledDate集中在${year}年9-11月，重点项目安排早一些`;

    const text = await chat([{ role: 'user', content: prompt }], { maxTokens: 1500 });
    let raw = {};
    try {
      const m = text.trim().match(/\{[\s\S]*\}/);
      if (m) raw = JSON.parse(m[0]);
    } catch {}

    const rawItems = (raw.items || []).map(i => ({
      name: i.name || '',
      category: i.category || '检验检查',
      scheduledDate: i.scheduledDate ? new Date(i.scheduledDate) : null,
      notes: i.notes || '',
      status: 'pending',
    }));
    const matchedItems = await matchCheckupItemsToRequisitionLibrary(rawItems);

    const plan = await HealthPlan.create({
      patientId: user._id,
      staffId: req.staff._id,
      type: 'annual_checkup',
      title: raw.title || `${year}年${user.name}年度体检方案`,
      description: raw.description || '',
      year,
      items: matchedItems,
      content: { aiStatus: 'pending', aiGeneratedBy: req.staff.name || '' },
      status: 'draft',
    });

    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
