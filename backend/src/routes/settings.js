const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

const CompanyInfo    = require('../models/CompanyInfo');
const Department     = require('../models/Department');
const StaffRole      = require('../models/StaffRole');
const Admin          = require('../models/Admin');
const Team           = require('../models/Team');
const MemberTag      = require('../models/MemberTag');
const MemberSource   = require('../models/MemberSource');
const MemberType     = require('../models/MemberType');
const ServicePackage = require('../models/ServicePackage');
const Disease        = require('../models/Disease');
const ProjectCategory = require('../models/ProjectCategory');
const LabTestItem    = require('../models/LabTestItem');
const LabTestOrder   = require('../models/LabTestOrder');
const LabTestPackage = require('../models/LabTestPackage');
const SpecialExam    = require('../models/SpecialExam');
const FunctionalMedicineTest = require('../models/FunctionalMedicineTest');
const ServiceItem    = require('../models/ServiceItem');
const OtherCharge    = require('../models/OtherCharge');
const ProjectTemplate = require('../models/ProjectTemplate');
const FollowUpForm   = require('../models/FollowUpForm');
const FollowUpPlan   = require('../models/FollowUpPlan');
const MedicalInstitution = require('../models/MedicalInstitution');
const MedicalDepartment = require('../models/MedicalDepartment');
const MedicalExpert = require('../models/MedicalExpert');

// ─────────────────────────────────────────────────────────────
// 工具：拼音首字母助记码（简单实现，正式可接 pinyin 库）
// ─────────────────────────────────────────────────────────────
function genMnemonic(name) {
  // 仅对 ASCII 字符生成首字母，中文留空等前端或后续补充
  return name.replace(/[a-zA-Z]+/g, w => w[0].toUpperCase()).replace(/[^A-Z]/g, '') || '';
}

// ═══════════════════════════════════════════════════════════════
// 一、基本设置
// ═══════════════════════════════════════════════════════════════

// ── 企业信息（单例）─────────────────────────────────────────────
router.get('/company-info', adminAuth, async (req, res) => {
  let info = await CompanyInfo.findOne();
  if (!info) info = await CompanyInfo.create({});
  res.json({ success: true, data: info });
});

router.put('/company-info', adminAuth, async (req, res) => {
  const { name, creditCode, logo, slogan, tagline, phone, address, customFields } = req.body;
  let info = await CompanyInfo.findOne();
  if (!info) info = new CompanyInfo();
  Object.assign(info, { name, creditCode, logo, slogan, tagline, phone, address, customFields });
  await info.save();
  res.json({ success: true, data: info, message: '企业信息已保存' });
});

// ── 部门管理 ────────────────────────────────────────────────────
router.get('/departments', adminAuth, async (req, res) => {
  const list = await Department.find().sort({ sortOrder: 1, createdAt: 1 });
  res.json({ success: true, data: list });
});

router.post('/departments', adminAuth, async (req, res) => {
  const { name, bookable, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '部门名称不能为空' });
  const existing = await Department.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '部门名称已存在' });
  const dept = await Department.create({ name, bookable: !!bookable, sortOrder: sortOrder || 0 });
  res.json({ success: true, data: dept, message: '部门已创建' });
});

router.put('/departments/:id', adminAuth, async (req, res) => {
  const { name, bookable, sortOrder } = req.body;
  if (name) {
    const dup = await Department.findOne({ name, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '部门名称已存在' });
  }
  const dept = await Department.findByIdAndUpdate(req.params.id, { name, bookable, sortOrder }, { new: true });
  if (!dept) return res.status(404).json({ success: false, message: '部门不存在' });
  res.json({ success: true, data: dept, message: '部门已更新' });
});

router.patch('/departments/:id/toggle', adminAuth, async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) return res.status(404).json({ success: false, message: '部门不存在' });
  dept.status = dept.status === 'active' ? 'inactive' : 'active';
  await dept.save();
  res.json({ success: true, data: dept });
});

router.delete('/departments/:id', adminAuth, async (req, res) => {
  // 检查是否有员工使用该部门
  const inUse = await Admin.findOne({ deptId: req.params.id });
  if (inUse) return res.status(400).json({ success: false, message: '该部门下有员工，无法删除' });
  await Department.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '部门已删除' });
});

// ── 角色管理 ────────────────────────────────────────────────────
const DEFAULT_PERMISSIONS = {
  patients:       { view: false, create: false, edit: false, delete: false },
  orders:         { view: false, edit: false },
  messages:       { view: false, send: false },
  services:       { view: false, create: false, edit: false, delete: false },
  products:       { view: false, create: false, edit: false, delete: false },
  questionnaires: { view: false, create: false, edit: false, delete: false },
  staff:          { view: false, create: false, edit: false, delete: false },
  settings:       { view: false, edit: false },
  projects:       { view: false, create: false, edit: false, delete: false },
  reports:        { view: false, audit: false },
  followups:      { view: false, create: false, edit: false, delete: false },
};

router.get('/roles', adminAuth, async (req, res) => {
  const list = await StaffRole.find().sort({ createdAt: 1 });
  res.json({ success: true, data: list });
});

router.post('/roles', adminAuth, async (req, res) => {
  const { name, permissions } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '角色名称不能为空' });
  const existing = await StaffRole.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '角色名称已存在' });
  const role = await StaffRole.create({ name, permissions: permissions || DEFAULT_PERMISSIONS });
  res.json({ success: true, data: role, message: '角色已创建' });
});

router.put('/roles/:id', adminAuth, async (req, res) => {
  const { name, permissions } = req.body;
  if (name) {
    const dup = await StaffRole.findOne({ name, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '角色名称已存在' });
  }
  const role = await StaffRole.findByIdAndUpdate(req.params.id, { name, permissions }, { new: true });
  if (!role) return res.status(404).json({ success: false, message: '角色不存在' });
  res.json({ success: true, data: role, message: '角色已更新' });
});

router.delete('/roles/:id', adminAuth, async (req, res) => {
  const inUse = await Admin.findOne({ customRoleId: req.params.id });
  if (inUse) return res.status(400).json({ success: false, message: '该角色已被员工使用，无法删除' });
  await StaffRole.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '角色已删除' });
});

// ── 员工管理 ────────────────────────────────────────────────────
const SYSTEM_ROLES = [
  'familyDoctor', 'nutritionist', 'healthManager',
  'medicalAssistant', 'psychologist', 'rehabSpecialist',
  'tcmDoctor', 'specialist', 'healthPlanner',
];

router.get('/employees', adminAuth, async (req, res) => {
  const { q = '', deptId, staffStatus, page = 1, limit = 20 } = req.query;
  const filter = { role: { $in: SYSTEM_ROLES } };
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { username: { $regex: q, $options: 'i' } },
  ];
  if (deptId) filter.deptId = deptId;
  if (staffStatus) filter.staffStatus = staffStatus;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [list, total] = await Promise.all([
    Admin.find(filter)
      .populate('deptId', 'name')
      .populate('customRoleId', 'name')
      .populate('teamId', 'name')
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Admin.countDocuments(filter),
  ]);
  res.json({ success: true, data: list, total });
});

router.post('/employees', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可创建员工账号' });
  }
  const { username, password, name, role, title, email, certNumber, deptId, customRoleId, phone, personalPerformanceRule, teamId, mentorOfTeamId } = req.body;
  if (!password || !name || !role) {
    return res.status(400).json({ success: false, message: '密码、姓名、角色不能为空' });
  }
  if (!phone) {
    return res.status(400).json({ success: false, message: '手机号码不能为空' });
  }
  if (!SYSTEM_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '角色无效' });
  }
  const phoneExists = await Admin.findOne({ phone });
  if (phoneExists) return res.status(400).json({ success: false, message: '该手机号已被使用' });
  const finalUsername = username || `jy_${Date.now().toString(36)}`;
  const usernameExists = await Admin.findOne({ username: finalUsername });
  if (usernameExists) return res.status(400).json({ success: false, message: '用户名已存在' });

  const emp = await Admin.create({
    username: finalUsername, password, name, role, phone,
    title: title || '', email: email || '', certNumber: certNumber || '',
    deptId: deptId || null, customRoleId: customRoleId || null,
    teamId: teamId || null,
    personalPerformanceRule: personalPerformanceRule || undefined,
    staffStatus: 'active',
    mustChangePassword: true,
  });
  if (mentorOfTeamId) await Team.findByIdAndUpdate(mentorOfTeamId, { mentorId: emp._id });
  res.json({ success: true, data: { _id: emp._id, name: emp.name, username: emp.username }, message: '员工账号已创建' });
});

router.put('/employees/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可修改员工账号' });
  }
  const { name, role, title, email, certNumber, deptId, customRoleId, password, phone, personalPerformanceRule, teamId, mentorOfTeamId } = req.body;
  const emp = await Admin.findById(req.params.id);
  if (!emp || !SYSTEM_ROLES.includes(emp.role)) {
    return res.status(404).json({ success: false, message: '员工不存在' });
  }
  if (phone && phone !== emp.phone) {
    const phoneExists = await Admin.findOne({ phone, _id: { $ne: emp._id } });
    if (phoneExists) return res.status(400).json({ success: false, message: '该手机号已被其他员工使用' });
    emp.phone = phone;
  }
  if (name) emp.name = name;
  if (role && SYSTEM_ROLES.includes(role)) emp.role = role;
  if (title !== undefined) emp.title = title;
  if (email !== undefined) emp.email = email;
  if (certNumber !== undefined) emp.certNumber = certNumber;
  if (deptId !== undefined) emp.deptId = deptId || null;
  if (customRoleId !== undefined) emp.customRoleId = customRoleId || null;
  if (teamId !== undefined) emp.teamId = teamId || null;
  if (personalPerformanceRule !== undefined) emp.personalPerformanceRule = personalPerformanceRule;
  if (password) {
    emp.password = password;
    emp.mustChangePassword = true;
  }
  await emp.save();
  // mentorOfTeamId：该员工被设为哪个团队的导师（先清除其原有导师身份，再按提交值设置新团队）
  if (mentorOfTeamId !== undefined) {
    await Team.updateMany({ mentorId: emp._id }, { $set: { mentorId: null } });
    if (mentorOfTeamId) await Team.findByIdAndUpdate(mentorOfTeamId, { mentorId: emp._id });
  }
  res.json({ success: true, data: { _id: emp._id, name: emp.name }, message: '员工信息已更新' });
});

router.patch('/employees/:id/toggle', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可操作' });
  }
  const emp = await Admin.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: '员工不存在' });
  emp.staffStatus = emp.staffStatus === 'active' ? 'inactive' : 'active';
  await emp.save();
  res.json({ success: true, data: { staffStatus: emp.staffStatus }, message: emp.staffStatus === 'active' ? '账号已启用' : '账号已停用' });
});

router.patch('/employees/:id/reset-password', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可重置密码' });
  }
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: '新密码不能少于6位' });
  }
  const emp = await Admin.findById(req.params.id);
  if (!emp) return res.status(404).json({ success: false, message: '员工不存在' });
  emp.password = password;
  emp.mustChangePassword = true;
  await emp.save();
  res.json({ success: true, message: '密码已重置，员工下次登录时必须修改密码' });
});

router.delete('/employees/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可删除员工账号' });
  }
  const emp = await Admin.findById(req.params.id);
  if (!emp || !SYSTEM_ROLES.includes(emp.role)) {
    return res.status(404).json({ success: false, message: '员工不存在' });
  }
  await emp.deleteOne();
  res.json({ success: true, message: '员工账号已删除' });
});

// ── 医疗资源库：医院 → 医院科室 → 专家；与公司内部部门、员工账号分离 ──
const cleanList = value => [...new Set((Array.isArray(value) ? value : String(value || '').split(/[、,，;；\n]+/)).map(v => String(v).trim()).filter(Boolean))];
const cleanCampuses = value => (Array.isArray(value) ? value : []).map(item => ({
  name: String(item?.name || '').trim().slice(0, 100),
  address: String(item?.address || '').trim().slice(0, 500),
  contactName: String(item?.contactName || '').trim().slice(0, 100),
  contactTitle: String(item?.contactTitle || '').trim().slice(0, 100),
  phone: String(item?.phone || '').trim().slice(0, 100),
})).filter(item => item.name);

router.get('/medical-resources', adminAuth, async (req, res) => {
  const [institutions, departments, experts] = await Promise.all([
    MedicalInstitution.find().sort({ name: 1 }).lean(),
    MedicalDepartment.find().populate('institutionId', 'name').sort({ name: 1 }).lean(),
    MedicalExpert.find().populate('institutionId', 'name level').populate('departmentId', 'name campus').populate('linkedStaffId', 'name role title').sort({ name: 1 }).lean(),
  ]);
  res.json({ success: true, data: { institutions, departments, experts } });
});

router.post('/medical-institutions', adminAuth, async (req, res) => {
  if (!req.body.name?.trim()) return res.status(400).json({ success: false, message: '请填写医院名称' });
  const campusDetails = cleanCampuses(req.body.campusDetails);
  const item = await MedicalInstitution.create({ ...req.body, name: req.body.name.trim(), aliases: cleanList(req.body.aliases), campusDetails, campuses: campusDetails.map(item => item.name) });
  res.status(201).json({ success: true, data: item });
});
router.put('/medical-institutions/:id', adminAuth, async (req, res) => {
  const campusDetails = cleanCampuses(req.body.campusDetails);
  const item = await MedicalInstitution.findByIdAndUpdate(req.params.id, { ...req.body, aliases: cleanList(req.body.aliases), campusDetails, campuses: campusDetails.map(item => item.name) }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: '医院不存在' });
  res.json({ success: true, data: item });
});
router.patch('/medical-institutions/:id/toggle', adminAuth, async (req, res) => {
  const item = await MedicalInstitution.findById(req.params.id); if (!item) return res.status(404).json({ success: false, message: '医院不存在' });
  item.status = item.status === 'active' ? 'inactive' : 'active'; await item.save(); res.json({ success: true, data: item });
});

router.post('/medical-departments', adminAuth, async (req, res) => {
  if (!req.body.institutionId || !req.body.name?.trim()) return res.status(400).json({ success: false, message: '请选择医院并填写科室名称' });
  if (!await MedicalInstitution.exists({ _id: req.body.institutionId })) return res.status(400).json({ success: false, message: '所选医院不存在' });
  const item = await MedicalDepartment.create({ ...req.body, name: req.body.name.trim(), specialties: cleanList(req.body.specialties) });
  res.status(201).json({ success: true, data: item });
});
router.put('/medical-departments/:id', adminAuth, async (req, res) => {
  if (!await MedicalInstitution.exists({ _id: req.body.institutionId })) return res.status(400).json({ success: false, message: '所选医院不存在' });
  const item = await MedicalDepartment.findByIdAndUpdate(req.params.id, { ...req.body, specialties: cleanList(req.body.specialties) }, { new: true, runValidators: true });
  if (!item) return res.status(404).json({ success: false, message: '医院科室不存在' }); res.json({ success: true, data: item });
});
router.patch('/medical-departments/:id/toggle', adminAuth, async (req, res) => {
  const item = await MedicalDepartment.findById(req.params.id); if (!item) return res.status(404).json({ success: false, message: '医院科室不存在' });
  item.status = item.status === 'active' ? 'inactive' : 'active'; await item.save(); res.json({ success: true, data: item });
});

router.post('/medical-experts', adminAuth, async (req, res) => {
  if (!req.body.name?.trim() || !req.body.institutionId || !req.body.departmentId) return res.status(400).json({ success: false, message: '姓名、医院和科室不能为空' });
  const department = await MedicalDepartment.findOne({ _id: req.body.departmentId, institutionId: req.body.institutionId });
  if (!department) return res.status(400).json({ success: false, message: '所选科室不属于该医院' });
  const item = await MedicalExpert.create({ ...req.body, name: req.body.name.trim(), expertise: cleanList(req.body.expertise), diseaseTags: cleanList(req.body.diseaseTags), serviceModes: cleanList(req.body.serviceModes), linkedStaffId: req.body.linkedStaffId || null });
  if (item.linkedStaffId) {
    await MedicalExpert.updateMany({ _id: { $ne: item._id }, linkedStaffId: item.linkedStaffId }, { $set: { linkedStaffId: null } });
    await Admin.findByIdAndUpdate(item.linkedStaffId, { expertProfileId: item._id });
  }
  res.status(201).json({ success: true, data: item });
});
router.put('/medical-experts/:id', adminAuth, async (req, res) => {
  const previous = await MedicalExpert.findById(req.params.id); if (!previous) return res.status(404).json({ success: false, message: '专家不存在' });
  const department = await MedicalDepartment.findOne({ _id: req.body.departmentId, institutionId: req.body.institutionId });
  if (!department) return res.status(400).json({ success: false, message: '所选科室不属于该医院' });
  const linkedStaffId = req.body.linkedStaffId || null;
  const item = await MedicalExpert.findByIdAndUpdate(req.params.id, { ...req.body, expertise: cleanList(req.body.expertise), diseaseTags: cleanList(req.body.diseaseTags), serviceModes: cleanList(req.body.serviceModes), linkedStaffId }, { new: true, runValidators: true });
  if (previous.linkedStaffId && String(previous.linkedStaffId) !== String(linkedStaffId || '')) await Admin.findByIdAndUpdate(previous.linkedStaffId, { $set: { expertProfileId: null } });
  if (linkedStaffId) {
    await MedicalExpert.updateMany({ _id: { $ne: item._id }, linkedStaffId }, { $set: { linkedStaffId: null } });
    await Admin.findByIdAndUpdate(linkedStaffId, { expertProfileId: item._id });
  }
  res.json({ success: true, data: item });
});
router.patch('/medical-experts/:id/toggle', adminAuth, async (req, res) => {
  const item = await MedicalExpert.findById(req.params.id); if (!item) return res.status(404).json({ success: false, message: '专家不存在' });
  item.status = item.status === 'active' ? 'inactive' : 'active'; await item.save(); res.json({ success: true, data: item });
});

// ── 会员标签 ────────────────────────────────────────────────────
router.get('/member-tags', adminAuth, async (req, res) => {
  const list = await MemberTag.find().sort({ createdAt: 1 });
  res.json({ success: true, data: list });
});

router.post('/member-tags', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '标签名称不能为空' });
  const existing = await MemberTag.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '标签名称已存在' });
  const tag = await MemberTag.create({ name });
  res.json({ success: true, data: tag, message: '标签已创建' });
});

router.put('/member-tags/:id', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (name) {
    const dup = await MemberTag.findOne({ name, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '标签名称已存在' });
  }
  const tag = await MemberTag.findByIdAndUpdate(req.params.id, { name }, { new: true });
  if (!tag) return res.status(404).json({ success: false, message: '标签不存在' });
  res.json({ success: true, data: tag, message: '标签已更新' });
});

router.patch('/member-tags/:id/toggle', adminAuth, async (req, res) => {
  const tag = await MemberTag.findById(req.params.id);
  if (!tag) return res.status(404).json({ success: false, message: '标签不存在' });
  tag.status = tag.status === 'active' ? 'inactive' : 'active';
  await tag.save();
  res.json({ success: true, data: tag });
});

router.delete('/member-tags/:id', adminAuth, async (req, res) => {
  await MemberTag.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '标签已删除' });
});

// ── 会员来源 ────────────────────────────────────────────────────
router.get('/member-sources', adminAuth, async (req, res) => {
  const list = await MemberSource.find().sort({ createdAt: 1 });
  res.json({ success: true, data: list });
});

router.post('/member-sources', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '来源名称不能为空' });
  const existing = await MemberSource.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '来源名称已存在' });
  const src = await MemberSource.create({ name });
  res.json({ success: true, data: src, message: '来源已创建' });
});

router.put('/member-sources/:id', adminAuth, async (req, res) => {
  const { name } = req.body;
  if (name) {
    const dup = await MemberSource.findOne({ name, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '来源名称已存在' });
  }
  const src = await MemberSource.findByIdAndUpdate(req.params.id, { name }, { new: true });
  if (!src) return res.status(404).json({ success: false, message: '来源不存在' });
  res.json({ success: true, data: src, message: '来源已更新' });
});

router.patch('/member-sources/:id/toggle', adminAuth, async (req, res) => {
  const src = await MemberSource.findById(req.params.id);
  if (!src) return res.status(404).json({ success: false, message: '来源不存在' });
  src.status = src.status === 'active' ? 'inactive' : 'active';
  await src.save();
  res.json({ success: true, data: src });
});

router.delete('/member-sources/:id', adminAuth, async (req, res) => {
  await MemberSource.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '来源已删除' });
});

// ── 会员类型（树形，复用 MemberType model，补充 parent 字段） ──
router.get('/member-types-tree', adminAuth, async (req, res) => {
  const filter = req.query.clientBrand ? { clientBrand: req.query.clientBrand } : {};
  const all = await MemberType.find(filter).sort({ clientBrand: 1, sortOrder: 1, createdAt: 1 }).lean();
  // 构建树
  const map = {};
  all.forEach(t => { map[t._id] = { ...t, children: [] }; });
  const roots = [];
  all.forEach(t => {
    if (t.parent && map[t.parent]) {
      map[t.parent].children.push(map[t._id]);
    } else {
      roots.push(map[t._id]);
    }
  });
  res.json({ success: true, data: roots });
});

router.post('/member-types-tree', adminAuth, async (req, res) => {
  const { name, parent, sortOrder, clientBrand } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '类型名称不能为空' });
  if (!['jiayiguanjia', 'jinyisen'].includes(clientBrand)) {
    return res.status(400).json({ success: false, message: '请选择客户归属' });
  }
  const existing = await MemberType.findOne({ name, clientBrand });
  if (existing) return res.status(400).json({ success: false, message: '类型名称已存在' });
  if (parent) {
    const parentType = await MemberType.findById(parent);
    if (!parentType || parentType.clientBrand !== clientBrand) {
      return res.status(400).json({ success: false, message: '父级类型与客户归属不一致' });
    }
  }
  const mt = await MemberType.create({ name, clientBrand, parent: parent || null, sortOrder: sortOrder || 0 });
  res.json({ success: true, data: mt, message: '会员类型已创建' });
});

router.put('/member-types-tree/:id', adminAuth, async (req, res) => {
  const { name, parent, sortOrder, clientBrand } = req.body;
  if (!['jiayiguanjia', 'jinyisen'].includes(clientBrand)) {
    return res.status(400).json({ success: false, message: '请选择客户归属' });
  }
  if (name) {
    const dup = await MemberType.findOne({ name, clientBrand, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '类型名称已存在' });
  }
  if (parent) {
    const parentType = await MemberType.findById(parent);
    if (!parentType || parentType.clientBrand !== clientBrand) {
      return res.status(400).json({ success: false, message: '父级类型与客户归属不一致' });
    }
  }
  const mt = await MemberType.findByIdAndUpdate(req.params.id, { name, clientBrand, parent: parent || null, sortOrder }, { new: true });
  if (!mt) return res.status(404).json({ success: false, message: '类型不存在' });
  res.json({ success: true, data: mt, message: '会员类型已更新' });
});

router.patch('/member-types-tree/:id/toggle', adminAuth, async (req, res) => {
  const mt = await MemberType.findById(req.params.id);
  if (!mt) return res.status(404).json({ success: false, message: '类型不存在' });
  mt.active = !mt.active;
  await mt.save();
  res.json({ success: true, data: mt });
});

router.delete('/member-types-tree/:id', adminAuth, async (req, res) => {
  const hasChildren = await MemberType.findOne({ parent: req.params.id });
  if (hasChildren) return res.status(400).json({ success: false, message: '该类型下有子类目，请先删除子类目' });
  await MemberType.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '类型已删除' });
});

router.get('/service-packages', adminAuth, async (req, res) => {
  const filter = req.query.clientBrand ? { clientBrand: req.query.clientBrand } : {};
  const list = await ServicePackage.find(filter).sort({ clientBrand: 1, sortOrder: 1, createdAt: 1 });
  res.json({ success: true, data: list });
});

router.post('/service-packages', adminAuth, async (req, res) => {
  const { name, clientBrand, sortOrder, entitlements, activation } = req.body;
  if (!name?.trim() || !['jiayiguanjia', 'jinyisen'].includes(clientBrand)) {
    return res.status(400).json({ success: false, message: '请填写名称并选择客户归属' });
  }
  const item = await ServicePackage.create({ name: name.trim(), clientBrand, sortOrder: sortOrder || 0, entitlements: entitlements || {}, activation: activation || {} });
  res.json({ success: true, data: item });
});

router.put('/service-packages/:id', adminAuth, async (req, res) => {
  const { name, clientBrand, sortOrder, entitlements, activation } = req.body;
  if (!name?.trim() || !['jiayiguanjia', 'jinyisen'].includes(clientBrand)) {
    return res.status(400).json({ success: false, message: '请填写名称并选择客户归属' });
  }
  const item = await ServicePackage.findByIdAndUpdate(
    req.params.id,
    { name: name.trim(), clientBrand, sortOrder: sortOrder || 0, entitlements: entitlements || {}, activation: activation || {} },
    { new: true, runValidators: true }
  );
  if (!item) return res.status(404).json({ success: false, message: '服务包不存在' });
  res.json({ success: true, data: item });
});

router.patch('/service-packages/:id/toggle', adminAuth, async (req, res) => {
  const item = await ServicePackage.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: '服务包不存在' });
  item.active = !item.active;
  await item.save();
  res.json({ success: true, data: item });
});

router.delete('/service-packages/:id', adminAuth, async (req, res) => {
  await ServicePackage.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════
// 二、项目设置
// ═══════════════════════════════════════════════════════════════

// ── 分类管理 ────────────────────────────────────────────────────
const normalizeCategoryAliases = value => Array.isArray(value)
  ? [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))]
  : [...new Set(String(value || '').split(/[，,、\n]/).map(v => v.trim()).filter(Boolean))];
const refreshClassificationIndex = () => {
  try { require('../utils/screeningMatch').invalidateAdminIndexCache(); } catch (_) { /* 下次读取重建 */ }
};

// A live queue over report items; no duplicated clinical data or background AI calls.
router.get('/report-classification', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅管理员可维护归类' });
  const MedicalReport = require('../models/MedicalReport');
  const name = String(req.query.name || '').trim().slice(0, 100);
  const itemFilter = name ? { name } : { name: { $ne: '' }, screeningKey: { $in: ['', null] }, 'screeningKeys.0': { $exists: false } };
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const reports = await MedicalReport.find({ reportItems: { $elemMatch: itemFilter } })
    .select('title reportItems reviewRevision institution checkDate audit_status').sort({ _id: 1 }).skip((page - 1) * 20).limit(20).lean();
  const rows = reports.flatMap(report => (report.reportItems || []).filter(item => name ? item.name === name : item.name && !item.screeningKey && !item.screeningKeys?.length)
    .map(item => ({ reportId: report._id, title: report.title, reviewRevision: report.reviewRevision || 0, item })));
  res.json({ success: true, data: rows, hasMore: reports.length === 20 });
});

router.post('/report-classification/confirm', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅管理员可维护归类' });
  const MedicalReport = require('../models/MedicalReport');
  const { buildAdminIndex, invalidateAdminIndexCache } = require('../utils/screeningMatch');
  const { confirmedRuleMatches, compatibleNode } = require('../utils/reportMatchContext');
  const report = await MedicalReport.findById(req.body.reportId).lean();
  if (!report) return res.status(404).json({ success: false, message: '报告不存在' });
  if (Number(report.reviewRevision || 0) !== req.body.expectedRevision) return res.status(409).json({ success: false, message: '报告已修改，请刷新后确认' });
  const item = report.reportItems.find(row => row.itemId === req.body.itemId);
  if (!item) return res.status(404).json({ success: false, message: '项目不存在' });
  const index = await buildAdminIndex();
  const node = index.find(entry => entry.node.categoryId === req.body.categoryId)?.node;
  if (!node || !compatibleNode(item, node)) return res.status(400).json({ success: false, message: '请选择有效末级分类；检查方式或部位不能冲突' });
  if (index.some(entry => entry.node.categoryId !== node.categoryId && (entry.node.confirmedRules || []).some(rule => confirmedRuleMatches(item, rule)))) {
    return res.status(409).json({ success: false, message: '已有冲突的确认规则，请先在原分类撤销该规则' });
  }
  const rule = Object.fromEntries(['name', 'orderName', 'sourceSection', 'specimen', 'modality', 'bodyPart', 'unit'].map(field => [field, String(item[field] || '')]));
  if (!(node.confirmedRules || []).some(existing => confirmedRuleMatches(item, existing))) {
    await ProjectCategory.findByIdAndUpdate(node.categoryId, { $push: { confirmedRules: { ...rule, confirmedBy: req.admin._id, confirmedAt: new Date() } } });
    invalidateAdminIndexCache();
  }
  const patch = { screeningKey: node.id, screeningKeys: [node.id], screeningCategory: node.category, screeningParent: node.parent, matchStatus: 'matched', matchConfidence: 1 };
  const set = Object.fromEntries(Object.entries(patch).map(([field, value]) => [`reportItems.$[item].${field}`, value]));
  const updated = await MedicalReport.findOneAndUpdate({ _id: report._id, ...(req.body.expectedRevision === 0 ? { $or: [{ reviewRevision: 0 }, { reviewRevision: { $exists: false } }] } : { reviewRevision: req.body.expectedRevision }) },
    { $set: set, $inc: { reviewRevision: 1 }, $push: { dataEditLog: { itemName: item.name, field: 'screeningKey', oldValue: item.screeningKey || '', newValue: node.id, operatorId: req.admin._id, operatorName: req.admin.name, source: 'admin_classification', at: new Date() } } },
    { new: true, arrayFilters: [{ 'item.itemId': item.itemId }] });
  if (!updated) return res.status(409).json({ success: false, message: '匹配规则已保存，报告发生并发修改，请刷新后再次应用' });
  if (updated.audit_status === 'audited') {
    await require('./staff').syncScreeningItems(updated.user, updated._id, updated.reportItems);
    const previousKey = item.screeningKey || item.screeningKeys?.[0];
    if (previousKey && previousKey !== node.id && !updated.reportItems.some(row => (row.screeningKey || row.screeningKeys?.[0]) === previousKey)) {
      await require('../models/UserScreeningItem').deleteMany({ user: updated.user, reportId: updated._id, itemId: previousKey });
    }
  }
  res.json({ success: true });
});

router.delete('/categories/:id/confirmed-rules/:ruleId', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false });
  await ProjectCategory.findByIdAndUpdate(req.params.id, { $pull: { confirmedRules: { _id: req.params.ruleId } } });
  refreshClassificationIndex();
  res.json({ success: true });
});

router.get('/categories', adminAuth, async (req, res) => {
  const all = await ProjectCategory.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
  const map = {};
  all.forEach(c => { map[c._id] = { ...c, children: [] }; });
  const roots = [];
  all.forEach(c => {
    if (c.parent && map[c.parent]) {
      map[c.parent].children.push(map[c._id]);
    } else {
      roots.push(map[c._id]);
    }
  });
  res.json({ success: true, data: roots, flat: all });
});

router.post('/categories', adminAuth, async (req, res) => {
  const { name, parent, sortOrder, aliases } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '分类名称不能为空' });
  const cat = await ProjectCategory.create({ name, parent: parent || null, sortOrder: sortOrder || 0, aliases: normalizeCategoryAliases(aliases) });
  refreshClassificationIndex();
  res.json({ success: true, data: cat, message: '分类已创建' });
});

router.put('/categories/:id', adminAuth, async (req, res) => {
  const { name, parent, sortOrder, aliases } = req.body;
  const update = { name, parent: parent || null, sortOrder };
  if (aliases !== undefined) update.aliases = normalizeCategoryAliases(aliases);
  const cat = await ProjectCategory.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!cat) return res.status(404).json({ success: false, message: '分类不存在' });
  refreshClassificationIndex();
  res.json({ success: true, data: cat, message: '分类已更新' });
});

router.delete('/categories/:id', adminAuth, async (req, res) => {
  const hasChildren = await ProjectCategory.findOne({ parent: req.params.id });
  if (hasChildren) return res.status(400).json({ success: false, message: '该分类下有子分类，请先删除' });
  await ProjectCategory.findByIdAndDelete(req.params.id);
  refreshClassificationIndex();
  res.json({ success: true, message: '分类已删除' });
});

// ── 疾病名称库 ──────────────────────────────────────────────────
router.get('/diseases', adminAuth, async (req, res) => {
  const { q = '', page = 1, limit = 20 } = req.query;
  const filter = {};
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { icdCode: { $regex: q, $options: 'i' } },
  ];
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [list, total] = await Promise.all([
    Disease.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Disease.countDocuments(filter),
  ]);
  res.json({ success: true, data: list, total });
});

router.post('/diseases', adminAuth, async (req, res) => {
  const { name, icdCode, category, remark } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '疾病名称不能为空' });
  const d = await Disease.create({ name, icdCode: icdCode || '', category: category || '', remark: remark || '' });
  res.json({ success: true, data: d, message: '疾病已添加' });
});

router.put('/diseases/:id', adminAuth, async (req, res) => {
  const { name, icdCode, category, remark } = req.body;
  const d = await Disease.findByIdAndUpdate(req.params.id, { name, icdCode, category, remark }, { new: true });
  if (!d) return res.status(404).json({ success: false, message: '疾病不存在' });
  res.json({ success: true, data: d, message: '疾病已更新' });
});

router.delete('/diseases/:id', adminAuth, async (req, res) => {
  await Disease.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '疾病已删除' });
});

// 批量导入（CSV/JSON 数组）
router.post('/diseases/import', adminAuth, async (req, res) => {
  const { items } = req.body; // [{ name, icdCode, category, remark }]
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: '数据不能为空' });
  }
  const docs = items.filter(i => i.name).map(i => ({
    name: i.name, icdCode: i.icdCode || '', category: i.category || '', remark: i.remark || '',
  }));
  const result = await Disease.insertMany(docs, { ordered: false }).catch(e => ({ insertedCount: 0, error: e.message }));
  res.json({ success: true, message: `成功导入 ${result.insertedCount || docs.length} 条` });
});

// ── 通用 CRUD 工厂（检验项目/医嘱/套餐/服务项目/其他收费） ─────
function makeProjectCRUD(Model, label) {
  router.get(`/${label}`, adminAuth, async (req, res) => {
    const { q = '', status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (q) filter.$or = [
      { name: { $regex: q, $options: 'i' } },
      { mnemonic: { $regex: q, $options: 'i' } },
    ];
    if (status) filter.status = status;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [list, total] = await Promise.all([
      Model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('categoryId', 'name'),
      Model.countDocuments(filter),
    ]);
    res.json({ success: true, data: list, total });
  });

  router.post(`/${label}`, adminAuth, async (req, res) => {
    try {
      if (!req.body.name) return res.status(400).json({ success: false, message: '名称不能为空' });
      if (!req.body.mnemonic) req.body.mnemonic = genMnemonic(req.body.name);
      if (req.body.categoryId === '' || req.body.categoryId === undefined) req.body.categoryId = null;
      const doc = await Model.create(req.body);
      res.json({ success: true, data: doc, message: '创建成功' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  });

  router.put(`/${label}/:id`, adminAuth, async (req, res) => {
    try {
      if (req.body.categoryId === '' || req.body.categoryId === undefined) req.body.categoryId = null;
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
      res.json({ success: true, data: doc, message: '更新成功' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  });

  router.patch(`/${label}/:id/toggle`, adminAuth, async (req, res) => {
    const doc = await Model.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
    doc.status = doc.status === 'active' ? 'inactive' : 'active';
    await doc.save();
    res.json({ success: true, data: doc });
  });

  router.delete(`/${label}/:id`, adminAuth, async (req, res) => {
    await Model.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: '已删除' });
  });
}

makeProjectCRUD(LabTestItem,    'lab-test-items');
makeProjectCRUD(LabTestOrder,   'lab-test-orders');

// 套餐列表：populate 三类项目，过滤已删除的 specialExams，使计数准确
router.get('/lab-test-packages', adminAuth, async (req, res) => {
  const { q = '', status, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (q) filter.$or = [{ name: { $regex: q, $options: 'i' } }, { mnemonic: { $regex: q, $options: 'i' } }];
  if (status) filter.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [list, total] = await Promise.all([
    LabTestPackage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit))
      .populate('categoryId', 'name')
      .populate('orders', 'name')
      .populate({ path: 'specialExams', match: { deleted: { $ne: true } }, select: 'name' })
      .populate('functionalTests', 'name'),
    LabTestPackage.countDocuments(filter),
  ]);
  res.json({ success: true, data: list, total });
});
makeProjectCRUD(LabTestPackage, 'lab-test-packages');
makeProjectCRUD(ServiceItem,    'service-items');
makeProjectCRUD(OtherCharge,    'other-charges');

// ── 特殊检查项目（额外支持软删除和检查类型筛选）──────────────────
router.get('/special-exams', adminAuth, async (req, res) => {
  const { q = '', examType, status, page = 1, limit = 20 } = req.query;
  const filter = { deleted: false };
  if (q) filter.$or = [
    { name: { $regex: q, $options: 'i' } },
    { mnemonic: { $regex: q, $options: 'i' } },
  ];
  if (examType) filter.examType = examType;
  if (status) filter.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [list, total] = await Promise.all([
    SpecialExam.find(filter).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).populate('categoryId', 'name'),
    SpecialExam.countDocuments(filter),
  ]);
  res.json({ success: true, data: list, total });
});

router.post('/special-exams', adminAuth, async (req, res) => {
  try {
    if (!req.body.name || !req.body.examType) {
      return res.status(400).json({ success: false, message: '名称和检查类型不能为空' });
    }
    if (!req.body.mnemonic) req.body.mnemonic = genMnemonic(req.body.name);
    if (req.body.categoryId === '' || req.body.categoryId === undefined) req.body.categoryId = null;
    const doc = await SpecialExam.create(req.body);
    res.json({ success: true, data: doc, message: '创建成功' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.put('/special-exams/:id', adminAuth, async (req, res) => {
  try {
    if (req.body.categoryId === '' || req.body.categoryId === undefined) req.body.categoryId = null;
    const doc = await SpecialExam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: doc, message: '更新成功' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

router.patch('/special-exams/:id/toggle', adminAuth, async (req, res) => {
  const doc = await SpecialExam.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
  doc.status = doc.status === 'active' ? 'inactive' : 'active';
  await doc.save();
  res.json({ success: true, data: doc });
});

router.delete('/special-exams/:id', adminAuth, async (req, res) => {
  // 软删除
  await SpecialExam.findByIdAndUpdate(req.params.id, { deleted: true });
  res.json({ success: true, message: '已删除' });
});

// ── 项目模板 ────────────────────────────────────────────────────
router.get('/project-templates', adminAuth, async (req, res) => {
  const list = await ProjectTemplate.find().sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

router.post('/project-templates', adminAuth, async (req, res) => {
  const { name, templateType, items } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '模板名称不能为空' });
  const tpl = await ProjectTemplate.create({ name, templateType: templateType || '', items: items || [] });
  res.json({ success: true, data: tpl, message: '模板已创建' });
});

router.put('/project-templates/:id', adminAuth, async (req, res) => {
  const { name, templateType, items, status } = req.body;
  const tpl = await ProjectTemplate.findByIdAndUpdate(req.params.id, { name, templateType, items, status }, { new: true });
  if (!tpl) return res.status(404).json({ success: false, message: '模板不存在' });
  res.json({ success: true, data: tpl, message: '模板已更新' });
});

router.delete('/project-templates/:id', adminAuth, async (req, res) => {
  await ProjectTemplate.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '模板已删除' });
});

// ── 随访表单 ────────────────────────────────────────────────────
router.get('/followup-forms', adminAuth, async (req, res) => {
  const list = await FollowUpForm.find().sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

router.post('/followup-forms', adminAuth, async (req, res) => {
  const { name, fields } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '表单名称不能为空' });
  const form = await FollowUpForm.create({ name, fields: fields || [] });
  res.json({ success: true, data: form, message: '表单已创建' });
});

router.put('/followup-forms/:id', adminAuth, async (req, res) => {
  const { name, fields, status } = req.body;
  const form = await FollowUpForm.findByIdAndUpdate(req.params.id, { name, fields, status }, { new: true });
  if (!form) return res.status(404).json({ success: false, message: '表单不存在' });
  res.json({ success: true, data: form, message: '表单已更新' });
});

router.patch('/followup-forms/:id/toggle', adminAuth, async (req, res) => {
  const form = await FollowUpForm.findById(req.params.id);
  if (!form) return res.status(404).json({ success: false, message: '表单不存在' });
  form.status = form.status === 'active' ? 'inactive' : 'active';
  await form.save();
  res.json({ success: true, data: form });
});

router.delete('/followup-forms/:id', adminAuth, async (req, res) => {
  // 检查是否被随访方案引用
  const inUse = await FollowUpPlan.findOne({ formId: req.params.id });
  if (inUse) return res.status(400).json({ success: false, message: '该表单已被随访方案使用，无法删除' });
  await FollowUpForm.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '表单已删除' });
});

// ── 随访方案 ────────────────────────────────────────────────────
router.get('/followup-plans', adminAuth, async (req, res) => {
  const list = await FollowUpPlan.find()
    .populate('formId', 'name fields')
    .populate('defaultEmployeeId', 'name role')
    .sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

router.post('/followup-plans', adminAuth, async (req, res) => {
  const { name, formId, cycles, defaultEmployeeId, default_content, category, executorRole, supervisorRole,
    remindDaysBefore, executorDueOffsetDays, supervisorDueOffsetDays, fixedToServiceDate, requiresCoordination, completionStandard,
    workflowStageKey, workflowTaskRole, activationEvent, closesService } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '方案名称不能为空' });
  const plan = await FollowUpPlan.create({
    name, formId: formId || null,
    cycles: cycles?.length ? cycles : [{ cycleType: 'duration', cycleDuration: 30, cycleUnit: 'day', notes: '' }],
    defaultEmployeeId: defaultEmployeeId || null,
    category: category || 'general', executorRole: executorRole || '', supervisorRole: supervisorRole || '',
    remindDaysBefore: Number.isFinite(Number(remindDaysBefore)) ? Number(remindDaysBefore) : 3,
    executorDueOffsetDays: Number.isFinite(Number(executorDueOffsetDays)) ? Number(executorDueOffsetDays) : -1,
    supervisorDueOffsetDays: Number.isFinite(Number(supervisorDueOffsetDays)) ? Number(supervisorDueOffsetDays) : 1,
    fixedToServiceDate: !!fixedToServiceDate,
    requiresCoordination: !!requiresCoordination, completionStandard: completionStandard || '',
    workflowStageKey: String(workflowStageKey || '').trim(), workflowTaskRole: workflowTaskRole || 'executor',
    activationEvent: activationEvent || '', closesService: !!closesService,
    default_content: default_content || {},
  });
  res.json({ success: true, data: plan, message: '随访方案已创建' });
});

router.put('/followup-plans/:id', adminAuth, async (req, res) => {
  const { name, formId, cycles, defaultEmployeeId, status, default_content, category, executorRole, supervisorRole,
    remindDaysBefore, executorDueOffsetDays, supervisorDueOffsetDays, fixedToServiceDate, requiresCoordination, completionStandard,
    workflowStageKey, workflowTaskRole, activationEvent, closesService } = req.body;
  const plan = await FollowUpPlan.findByIdAndUpdate(
    req.params.id,
    {
      name, formId: formId || null,
      cycles: cycles?.length ? cycles : [{ cycleType: 'duration', cycleDuration: 30, cycleUnit: 'day', notes: '' }],
      defaultEmployeeId: defaultEmployeeId || null,
      category: category || 'general', executorRole: executorRole || '', supervisorRole: supervisorRole || '',
      remindDaysBefore: Number.isFinite(Number(remindDaysBefore)) ? Number(remindDaysBefore) : 3,
      executorDueOffsetDays: Number.isFinite(Number(executorDueOffsetDays)) ? Number(executorDueOffsetDays) : -1,
      supervisorDueOffsetDays: Number.isFinite(Number(supervisorDueOffsetDays)) ? Number(supervisorDueOffsetDays) : 1,
      fixedToServiceDate: !!fixedToServiceDate,
      requiresCoordination: !!requiresCoordination, completionStandard: completionStandard || '',
      workflowStageKey: String(workflowStageKey || '').trim(), workflowTaskRole: workflowTaskRole || 'executor',
      activationEvent: activationEvent || '', closesService: !!closesService,
      status,
      default_content: default_content || {},
    },
    { new: true }
  ).populate('formId', 'name fields').populate('defaultEmployeeId', 'name role');
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  res.json({ success: true, data: plan, message: '随访方案已更新' });
});

router.patch('/followup-plans/:id/toggle', adminAuth, async (req, res) => {
  const plan = await FollowUpPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  plan.status = plan.status === 'active' ? 'inactive' : 'active';
  await plan.save();
  res.json({ success: true, data: plan });
});

router.patch('/followup-plans/:id/review', adminAuth, async (req, res) => {
  const reviewStatus = req.body?.reviewStatus;
  if (!['pending_review', 'approved'].includes(reviewStatus)) return res.status(400).json({ success: false, message: '审核状态无效' });
  const plan = await FollowUpPlan.findByIdAndUpdate(req.params.id, {
    reviewStatus,
    reviewedAt: reviewStatus === 'approved' ? new Date() : null,
    reviewedBy: reviewStatus === 'approved' ? req.admin._id : null,
  }, { new: true });
  if (!plan) return res.status(404).json({ success: false, message: '方案不存在' });
  res.json({ success: true, data: plan, message: reviewStatus === 'approved' ? '方案已审核通过' : '方案已退回待审核' });
});

router.delete('/followup-plans/:id', adminAuth, async (req, res) => {
  await FollowUpPlan.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '随访方案已删除' });
});

// ── 功能医学检测 ──────────────────────────────────────────────
router.get('/functional-medicine-tests', adminAuth, async (req, res) => {
  const { q = '', status, page = 1, limit = 20 } = req.query;
  const filter = { deleted: { $ne: true } };
  if (q) filter.name = { $regex: q, $options: 'i' };
  if (status) filter.status = status;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [list, total] = await Promise.all([
    FunctionalMedicineTest.find(filter).populate('categoryId', 'name').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    FunctionalMedicineTest.countDocuments(filter),
  ]);
  res.json({ success: true, data: list, total });
});

router.post('/functional-medicine-tests', adminAuth, async (req, res) => {
  try {
    if (!req.body.name?.trim()) return res.status(400).json({ success: false, message: '检测名称不能为空' });
    const doc = await FunctionalMedicineTest.create(req.body);
    res.json({ success: true, data: doc, message: '创建成功' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/functional-medicine-tests/:id', adminAuth, async (req, res) => {
  try {
    const doc = await FunctionalMedicineTest.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: doc, message: '已更新' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.patch('/functional-medicine-tests/:id/toggle', adminAuth, async (req, res) => {
  const doc = await FunctionalMedicineTest.findById(req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
  doc.status = doc.status === 'active' ? 'inactive' : 'active';
  await doc.save();
  res.json({ success: true, data: doc });
});

router.delete('/functional-medicine-tests/:id', adminAuth, async (req, res) => {
  await FunctionalMedicineTest.findByIdAndUpdate(req.params.id, { deleted: true });
  res.json({ success: true, message: '已删除' });
});

module.exports = router;
