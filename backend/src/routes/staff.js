const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const HealthRecord = require('../models/HealthRecord');
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
    'servicePackage', 'serviceExpiry',
  ];
  const updateData = {};
  allowed.forEach(k => {
    if (req.body[k] !== undefined) updateData[k] = req.body[k];
  });

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

module.exports = router;
