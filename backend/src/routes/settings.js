const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

const CompanyInfo    = require('../models/CompanyInfo');
const Department     = require('../models/Department');
const StaffRole      = require('../models/StaffRole');
const Admin          = require('../models/Admin');
const MemberTag      = require('../models/MemberTag');
const MemberSource   = require('../models/MemberSource');
const MemberType     = require('../models/MemberType');
const Disease        = require('../models/Disease');
const ProjectCategory = require('../models/ProjectCategory');
const LabTestItem    = require('../models/LabTestItem');
const LabTestOrder   = require('../models/LabTestOrder');
const LabTestPackage = require('../models/LabTestPackage');
const SpecialExam    = require('../models/SpecialExam');
const ServiceItem    = require('../models/ServiceItem');
const OtherCharge    = require('../models/OtherCharge');
const ProjectTemplate = require('../models/ProjectTemplate');
const FollowUpForm   = require('../models/FollowUpForm');
const FollowUpPlan   = require('../models/FollowUpPlan');

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
  const { username, password, name, role, title, email, certNumber, deptId, customRoleId } = req.body;
  if (!username || !password || !name || !role) {
    return res.status(400).json({ success: false, message: '用户名、密码、姓名、角色不能为空' });
  }
  if (!SYSTEM_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: '角色无效' });
  }
  const existing = await Admin.findOne({ username });
  if (existing) return res.status(400).json({ success: false, message: '用户名已存在' });

  const emp = await Admin.create({
    username, password, name, role,
    title: title || '', email: email || '', certNumber: certNumber || '',
    deptId: deptId || null, customRoleId: customRoleId || null,
    staffStatus: 'active',
  });
  res.json({ success: true, data: { _id: emp._id, name: emp.name, username: emp.username }, message: '员工账号已创建' });
});

router.put('/employees/:id', adminAuth, async (req, res) => {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ success: false, message: '仅超级管理员可修改员工账号' });
  }
  const { name, role, title, email, certNumber, deptId, customRoleId, password } = req.body;
  const emp = await Admin.findById(req.params.id);
  if (!emp || !SYSTEM_ROLES.includes(emp.role)) {
    return res.status(404).json({ success: false, message: '员工不存在' });
  }
  if (name) emp.name = name;
  if (role && SYSTEM_ROLES.includes(role)) emp.role = role;
  if (title !== undefined) emp.title = title;
  if (email !== undefined) emp.email = email;
  if (certNumber !== undefined) emp.certNumber = certNumber;
  if (deptId !== undefined) emp.deptId = deptId || null;
  if (customRoleId !== undefined) emp.customRoleId = customRoleId || null;
  if (password) emp.password = password; // triggers bcrypt pre-save
  await emp.save();
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
  await emp.save();
  res.json({ success: true, message: '密码已重置' });
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
  const all = await MemberType.find().sort({ sortOrder: 1, createdAt: 1 }).lean();
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
  const { name, parent, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '类型名称不能为空' });
  const existing = await MemberType.findOne({ name });
  if (existing) return res.status(400).json({ success: false, message: '类型名称已存在' });
  const mt = await MemberType.create({ name, parent: parent || null, sortOrder: sortOrder || 0 });
  res.json({ success: true, data: mt, message: '会员类型已创建' });
});

router.put('/member-types-tree/:id', adminAuth, async (req, res) => {
  const { name, parent, sortOrder } = req.body;
  if (name) {
    const dup = await MemberType.findOne({ name, _id: { $ne: req.params.id } });
    if (dup) return res.status(400).json({ success: false, message: '类型名称已存在' });
  }
  const mt = await MemberType.findByIdAndUpdate(req.params.id, { name, parent: parent || null, sortOrder }, { new: true });
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

// ═══════════════════════════════════════════════════════════════
// 二、项目设置
// ═══════════════════════════════════════════════════════════════

// ── 分类管理 ────────────────────────────────────────────────────
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
  const { name, parent, sortOrder } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '分类名称不能为空' });
  const cat = await ProjectCategory.create({ name, parent: parent || null, sortOrder: sortOrder || 0 });
  res.json({ success: true, data: cat, message: '分类已创建' });
});

router.put('/categories/:id', adminAuth, async (req, res) => {
  const { name, parent, sortOrder } = req.body;
  const cat = await ProjectCategory.findByIdAndUpdate(req.params.id, { name, parent: parent || null, sortOrder }, { new: true });
  if (!cat) return res.status(404).json({ success: false, message: '分类不存在' });
  res.json({ success: true, data: cat, message: '分类已更新' });
});

router.delete('/categories/:id', adminAuth, async (req, res) => {
  const hasChildren = await ProjectCategory.findOne({ parent: req.params.id });
  if (hasChildren) return res.status(400).json({ success: false, message: '该分类下有子分类，请先删除' });
  await ProjectCategory.findByIdAndDelete(req.params.id);
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
    if (!req.body.name) return res.status(400).json({ success: false, message: '名称不能为空' });
    if (!req.body.mnemonic) req.body.mnemonic = genMnemonic(req.body.name);
    const doc = await Model.create(req.body);
    res.json({ success: true, data: doc, message: '创建成功' });
  });

  router.put(`/${label}/:id`, adminAuth, async (req, res) => {
    const doc = await Model.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
    res.json({ success: true, data: doc, message: '更新成功' });
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
  if (!req.body.name || !req.body.examType) {
    return res.status(400).json({ success: false, message: '名称和检查类型不能为空' });
  }
  if (!req.body.mnemonic) req.body.mnemonic = genMnemonic(req.body.name);
  const doc = await SpecialExam.create(req.body);
  res.json({ success: true, data: doc, message: '创建成功' });
});

router.put('/special-exams/:id', adminAuth, async (req, res) => {
  const doc = await SpecialExam.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!doc) return res.status(404).json({ success: false, message: '记录不存在' });
  res.json({ success: true, data: doc, message: '更新成功' });
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
  const list = await FollowUpPlan.find().populate('formId', 'name').sort({ createdAt: -1 });
  res.json({ success: true, data: list });
});

router.post('/followup-plans', adminAuth, async (req, res) => {
  const { name, formId, cycleDuration, cycleUnit, defaultRole } = req.body;
  if (!name) return res.status(400).json({ success: false, message: '方案名称不能为空' });
  const plan = await FollowUpPlan.create({
    name, formId: formId || null,
    cycleDuration: cycleDuration || 30, cycleUnit: cycleUnit || 'day',
    defaultRole: defaultRole || '',
  });
  res.json({ success: true, data: plan, message: '随访方案已创建' });
});

router.put('/followup-plans/:id', adminAuth, async (req, res) => {
  const { name, formId, cycleDuration, cycleUnit, defaultRole, status } = req.body;
  const plan = await FollowUpPlan.findByIdAndUpdate(
    req.params.id,
    { name, formId: formId || null, cycleDuration, cycleUnit, defaultRole, status },
    { new: true }
  ).populate('formId', 'name');
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

router.delete('/followup-plans/:id', adminAuth, async (req, res) => {
  await FollowUpPlan.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: '随访方案已删除' });
});

module.exports = router;
