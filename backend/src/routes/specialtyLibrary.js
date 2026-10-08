const express = require('express');
const mongoose = require('mongoose');
const SpecialtyLibrary = require('../models/SpecialtyLibrary');
const Admin = require('../models/Admin');
const employeeRoles = require('../utils/employeeRoles');
const adminAuth = require('../middleware/adminAuth');
const staffAuth = require('../middleware/staffAuth');

const adminRouter = express.Router();
const staffRouter = express.Router();
const fields = ['title', 'overview', 'serviceBoundary', 'roles', 'diaryGuide', 'exceptionGuide', 'sourceNote'];
const maxLength = { title: 160, overview: 4000, serviceBoundary: 4000, roles: 4000, diaryGuide: 4000, exceptionGuide: 4000, sourceNote: 2000 };

function payload(body) {
  const value = {};
  for (const field of fields) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].length > maxLength[field]) throw new Error(`${field} 内容不符合要求`);
      value[field] = body[field].trim();
    }
  }
  if (body.diseases !== undefined) {
    if (!Array.isArray(body.diseases) || body.diseases.length > 20 || body.diseases.some(x => typeof x !== 'string' || x.length > 100)) throw new Error('疾病类型不符合要求');
    value.diseases = body.diseases.map(x => x.trim()).filter(Boolean);
  }
  if (body.stages !== undefined) {
    if (!Array.isArray(body.stages) || body.stages.length > 30) throw new Error('路径阶段不符合要求');
    value.stages = body.stages.map(stage => {
      if (!stage || typeof stage !== 'object' || !stage.title || typeof stage.title !== 'string' || stage.title.length > 100) throw new Error('阶段标题不符合要求');
      const entry = {};
      for (const [field, limit] of Object.entries({ title: 100, purpose: 2000, owner: 100, trigger: 1000, handoff: 2000 })) {
        if (stage[field] !== undefined && (typeof stage[field] !== 'string' || stage[field].length > limit)) throw new Error('阶段内容不符合要求');
        entry[field] = (stage[field] || '').trim();
      }
      return entry;
    });
  }
  return value;
}

function validId(req, res) {
  if (mongoose.isValidObjectId(req.params.id)) return true;
  res.status(400).json({ success: false, message: '无效的资料编号' });
  return false;
}

function requireEditor(req, res, next) {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '仅机构管理员可维护专病管理库' });
  next();
}

async function reviewerFields(reviewerId, tenantId) {
  if (!reviewerId) return { clinicalReviewerId: null, clinicalReviewer: '' };
  if (typeof reviewerId !== 'string' || !mongoose.isValidObjectId(reviewerId)) throw new Error('请选择员工库中的临床审核人');
  const reviewer = await Admin.findOne({ _id: reviewerId, tenantId, staffStatus: 'active', role: { $in: employeeRoles } }).select('name').lean();
  if (!reviewer) throw new Error('临床审核人不在本机构员工库中或已停用，请重新选择');
  return { clinicalReviewerId: reviewer._id, clinicalReviewer: reviewer.name };
}

adminRouter.use(adminAuth, requireEditor);
adminRouter.get('/', async (req, res) => {
  const items = await SpecialtyLibrary.find({ tenantId: req.admin.tenantId }).sort({ updatedAt: -1 }).lean();
  res.json({ success: true, data: items });
});
adminRouter.post('/', requireEditor, async (req, res) => {
  try {
    const data = payload(req.body);
    if (req.body.clinicalReviewerId !== undefined) Object.assign(data, await reviewerFields(req.body.clinicalReviewerId, req.admin.tenantId));
    if (!data.title) return res.status(400).json({ success: false, message: '请填写专病名称' });
    const programKey = new mongoose.Types.ObjectId().toString();
    const item = await SpecialtyLibrary.create({ ...data, tenantId: req.admin.tenantId, programKey, version: 1, createdBy: req.admin._id });
    res.status(201).json({ success: true, data: item });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
adminRouter.put('/:id', requireEditor, async (req, res) => {
  if (!validId(req, res)) return;
  try {
    const data = payload(req.body);
    if (req.body.clinicalReviewerId !== undefined) Object.assign(data, await reviewerFields(req.body.clinicalReviewerId, req.admin.tenantId));
    if (data.title === '') return res.status(400).json({ success: false, message: '请填写专病名称' });
    const item = await SpecialtyLibrary.findOneAndUpdate({ _id: req.params.id, tenantId: req.admin.tenantId, status: 'draft' }, { $set: data }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, message: '草稿不存在或已发布' });
    res.json({ success: true, data: item });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
adminRouter.post('/:id/revise', requireEditor, async (req, res) => {
  if (!validId(req, res)) return;
  const source = await SpecialtyLibrary.findOne({ _id: req.params.id, tenantId: req.admin.tenantId, status: { $in: ['published', 'archived'] } }).lean();
  if (!source) return res.status(404).json({ success: false, message: '已发布版本不存在' });
  const existing = await SpecialtyLibrary.findOne({ tenantId: req.admin.tenantId, programKey: source.programKey, status: 'draft' });
  if (existing) return res.status(409).json({ success: false, message: '已有修订草稿，请先完成该草稿' });
  const latest = await SpecialtyLibrary.findOne({ tenantId: req.admin.tenantId, programKey: source.programKey }).sort({ version: -1 }).lean();
  try {
    const copy = await SpecialtyLibrary.create({ ...payload(source), clinicalReviewer: '', clinicalReviewerId: null, tenantId: req.admin.tenantId, programKey: source.programKey, version: latest.version + 1, status: 'draft', createdBy: req.admin._id });
    res.status(201).json({ success: true, data: copy });
  } catch (error) { res.status(error.code === 11000 ? 409 : 400).json({ success: false, message: error.code === 11000 ? '版本冲突，请刷新重试' : error.message }); }
});
adminRouter.patch('/:id/publish', requireEditor, async (req, res) => {
  if (!validId(req, res)) return;
  const current = await SpecialtyLibrary.findOne({ _id: req.params.id, tenantId: req.admin.tenantId, status: 'draft' });
  if (!current) return res.status(404).json({ success: false, message: '草稿不存在或已发布' });
  if (!current.title || !current.stages.length || !current.serviceBoundary || !current.roles || !current.clinicalReviewerId) return res.status(400).json({ success: false, message: '发布前请填写标题、服务阶段、服务边界、岗位职责并从员工库选择审核人' });
  let reviewer;
  try { reviewer = await reviewerFields(String(current.clinicalReviewerId), req.admin.tenantId); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  const item = await SpecialtyLibrary.findOneAndUpdate({ _id: current._id, tenantId: req.admin.tenantId, status: 'draft' }, { $set: { ...reviewer, status: 'published', publishedAt: new Date(), publishedBy: req.admin._id } }, { new: true });
  if (!item) return res.status(409).json({ success: false, message: '发布状态已变化，请刷新' });
  res.json({ success: true, data: item });
});
adminRouter.patch('/:id/archive', requireEditor, async (req, res) => {
  if (!validId(req, res)) return;
  const item = await SpecialtyLibrary.findOneAndUpdate({ _id: req.params.id, tenantId: req.admin.tenantId, status: 'published' }, { $set: { status: 'archived' } }, { new: true });
  if (!item) return res.status(404).json({ success: false, message: '已发布版本不存在' });
  res.json({ success: true, data: item });
});

staffRouter.use(staffAuth);
staffRouter.get('/', async (req, res) => {
  const items = await SpecialtyLibrary.find({ tenantId: req.staff.tenantId, status: { $in: ['published', 'archived'] } }).sort({ version: -1 }).lean();
  const latest = [];
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.programKey)) continue;
    seen.add(item.programKey);
    if (item.status === 'published') latest.push(item);
  }
  res.json({ success: true, data: latest });
});

module.exports = { adminRouter, staffRouter, payload };
