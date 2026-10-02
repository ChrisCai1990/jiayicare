const express = require('express');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const SystemConfig = require('../models/SystemConfig');
const ClinicalStandardWatch = require('../models/ClinicalStandardWatch');
const ClinicalStandardUpdate = require('../models/ClinicalStandardUpdate');
const { standards } = require('../../../shared/clinicalStandards.cjs');
const { checkAll } = require('../utils/clinicalStandardMonitor');
const router = express.Router();
const DELEGATION_KEY = 'clinicalStandardDelegation';
const reviewerKey = tenantId => `clinicalStandardReviewer:${tenantId}`;
router.use(adminAuth, (req, res, next) => ['platformSuper', 'superadmin'].includes(req.admin.role)
  ? next() : res.status(403).json({ success: false, message: '仅平台或机构管理员可管理标准审核' }));

router.get('/', async (req, res) => {
  const platform = req.admin.role === 'platformSuper';
  const updatePage = Math.max(1, Math.min(100000, Number.parseInt(req.query.updatePage, 10) || 1));
  const pageSize = 25;
  const [watches, updates, updateTotal, pendingCount, delegation, tenants] = await Promise.all([
    ClinicalStandardWatch.find().lean(),
    ClinicalStandardUpdate.find().sort({ detectedAt: -1, _id: -1 }).skip((updatePage - 1) * pageSize).limit(pageSize).lean(),
    ClinicalStandardUpdate.countDocuments(),
    ClinicalStandardUpdate.countDocuments({ status: 'pending' }),
    SystemConfig.findOne({ key: DELEGATION_KEY }).lean(),
    platform ? Tenant.find({ status: 'active' }).select('name code').sort({ name: 1 }).lean() : Promise.resolve([]),
  ]);
  const delegatedTenantId = String(delegation?.value?.tenantId || '');
  const canAssign = !platform && delegatedTenantId === String(req.admin.tenantId || '');
  const [reviewerConfig, reviewers] = canAssign ? await Promise.all([
    SystemConfig.findOne({ key: reviewerKey(delegatedTenantId) }).lean(),
    Admin.find({ tenantId: req.admin.tenantId, role: 'familyDoctor', staffStatus: 'active' }).select('name title').lean(),
  ]) : [null, []];
  const latestWatches = new Map();
  for (const row of watches) {
    const previous = latestWatches.get(row.standardId);
    if (!previous || new Date(row.checkedAt || 0) > new Date(previous.checkedAt || 0) ||
      (String(row.checkedAt) === String(previous.checkedAt) && String(row._id) > String(previous._id))) latestWatches.set(row.standardId, row);
  }
  res.json({ success: true, data: {
    standards: standards.map(item => ({ ...item, watch: latestWatches.get(item.id) || null })),
    updates, updateTotal, pendingCount, updatePage, tenants, delegatedTenantId, delegatedTenantName: delegation?.value?.tenantName || '',
    delegationConfirmedAt: delegation?.value?.confirmedAt || null,
    canAssign, reviewerId: reviewerConfig?.value?.staffId || '', reviewers,
  } });
});

router.put('/delegation', async (req, res) => {
  if (req.admin.role !== 'platformSuper') return res.status(403).json({ success: false, message: '仅平台管理员可确认委托机构' });
  const id = String(req.body?.tenantId || '');
  if (req.body?.confirmed !== true || !mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: '请选择机构并确认委托' });
  const tenant = await Tenant.findOne({ _id: id, status: 'active' }).select('name').lean();
  if (!tenant) return res.status(400).json({ success: false, message: '机构不存在或已停用' });
  const value = { tenantId: id, tenantName: tenant.name, confirmedAt: new Date(), confirmedBy: req.admin._id, confirmedByName: req.admin.name };
  await SystemConfig.updateOne({ key: DELEGATION_KEY }, { $set: { value, label: '临床标准审核受托机构' } }, { upsert: true });
  res.json({ success: true, data: value });
});

router.put('/reviewer', async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ success: false, message: '由受托机构管理员指定健康顾问' });
  const delegation = await SystemConfig.findOne({ key: DELEGATION_KEY }).lean();
  const tenantId = String(req.admin.tenantId || '');
  if (String(delegation?.value?.tenantId || '') !== tenantId) return res.status(403).json({ success: false, message: '本机构尚未受托审核临床标准' });
  const id = String(req.body?.staffId || '');
  if (req.body?.confirmed !== true || !mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: '请选择健康顾问并确认指派' });
  const reviewer = await Admin.findOne({ _id: id, tenantId: req.admin.tenantId, role: 'familyDoctor', staffStatus: 'active' }).select('name').lean();
  if (!reviewer) return res.status(400).json({ success: false, message: '健康顾问不存在、已停用或不属于本机构' });
  const value = { staffId: id, name: reviewer.name, confirmedAt: new Date(), confirmedBy: req.admin._id, confirmedByName: req.admin.name };
  await SystemConfig.updateOne({ key: reviewerKey(tenantId) }, { $set: { value, label: '本机构临床标准更新审核人' } }, { upsert: true });
  res.json({ success: true, data: value });
});

router.post('/check', async (req, res) => {
  if (req.admin.role !== 'platformSuper') return res.status(403).json({ success: false, message: '仅平台管理员可立即检查来源' });
  const data = await checkAll({ force: true });
  res.json({ success: true, data });
});

module.exports = router;
