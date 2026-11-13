const router = require('express').Router();
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const Admin = require('../models/Admin');
const Product = require('../models/Product');
const ServicePackage = require('../models/ServicePackage');
const MarketPartner = require('../models/MarketPartner');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const StaffCommissionRule = require('../models/StaffCommissionRule');
const StaffServiceThresholdRule = require('../models/StaffServiceThresholdRule');

router.use(adminAuth);
router.use((req, res, next) => req.admin.role === 'superadmin' && req.admin.tenantId
  ? next() : res.status(403).json({ success: false, message: '仅机构超级管理员可设置人员佣金' }));

const validIds = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 200
  && ids.every(id => mongoose.isValidObjectId(id)) && new Set(ids.map(String)).size === ids.length;
const validRate = value => Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100;

router.get('/service-thresholds', async (req, res) => {
  const rows = await StaffServiceThresholdRule.find({ tenantId: req.admin.tenantId })
    .sort({ createdAt: -1 }).limit(2000).lean();
  res.json({ success: true, data: rows });
});

router.get('/service-thresholds/volume', async (req, res) => {
  const staffId = String(req.query.staffId || '');
  const { monthlyServiceEvents, monthOf, quarterMonths } = require('../utils/staffServiceThreshold');
  const month = String(req.query.month || monthOf(new Date()));
  if (!mongoose.isValidObjectId(staffId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return res.status(400).json({ success: false, message: '请选择员工和有效月份' });
  const tenantId = req.admin.tenantId;
  if (!await Admin.exists({ _id: staffId, tenantId }))
    return res.status(404).json({ success: false, message: '本机构员工不存在' });
  const events = await monthlyServiceEvents(tenantId, staffId, month);
  const volumeCents = events.reduce((sum, item) => sum + item.amountCents, 0);
  const quarter = quarterMonths(new Date(`${month}-15T12:00:00+08:00`));
  const quarterRows = await Promise.all(quarter.map(item => item === month
    ? Promise.resolve(events) : monthlyServiceEvents(tenantId, staffId, item)));
  const quarterVolumeCents = quarterRows.flat().reduce((sum, item) => sum + item.amountCents, 0);
  const rule = await StaffServiceThresholdRule.findOne({ tenantId, staffId, effectiveUntil: null })
    .sort({ version: -1 }).lean();
  res.json({ success: true, data: { month, volumeCents,
    thresholdCents: rule?.thresholdCents || 0,
    excessCents: Math.max(0, volumeCents - (rule?.thresholdCents || 0)),
    quarterMonths: quarter, quarterVolumeCents,
    quarterThresholdCents: (rule?.thresholdCents || 0) * 3,
    quarterExcessCents: Math.max(0, quarterVolumeCents - (rule?.thresholdCents || 0) * 3),
    orderCount: new Set(events.map(item => item.orderId)).size } });
});

router.post('/service-thresholds', async (req, res) => {
  const staffId = req.body?.staffId;
  const value = Number(req.body?.thresholdYuan);
  const thresholdCents = Math.round(value * 100);
  if (!mongoose.isValidObjectId(staffId) || !Number.isSafeInteger(thresholdCents)
    || value < 0 || value > 100000000)
    return res.status(400).json({ success: false, message: '请选择员工并填写有效的月度基础服务业务量' });
  const tenantId = req.admin.tenantId;
  if (!await Admin.exists({ _id: staffId, tenantId, staffStatus: 'active' }))
    return res.status(404).json({ success: false, message: '本机构在职员工不存在' });
  const previous = await StaffServiceThresholdRule.findOne({ tenantId, staffId })
    .sort({ version: -1 }).lean();
  const now = new Date();
  try {
    const row = await StaffServiceThresholdRule.create({ tenantId, staffId,
      thresholdCents, version: (previous?.version || 0) + 1,
      effectiveFrom: now, createdBy: req.admin._id });
    await StaffServiceThresholdRule.updateMany({ tenantId, staffId,
      _id: { $ne: row._id }, effectiveUntil: null }, { $set: { effectiveUntil: now } });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false,
      message: error.code === 11000 ? '门槛版本已变化，请刷新后重试' : '保存服务业务量门槛失败' });
  }
});

router.get('/staff', async (req, res) => {
  const rows = await StaffCommissionRule.find({ tenantId: req.admin.tenantId })
    .sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ success: true, data: rows });
});

router.post('/staff', async (req, res) => {
  const { staffId, category, productIds, referrerRate, fulfillerRate } = req.body || {};
  if (!mongoose.isValidObjectId(staffId) || !String(category || '').trim() || !validIds(productIds) || productIds.length !== 1
    || !validRate(referrerRate) || !validRate(fulfillerRate))
    return res.status(400).json({ success: false, message: '请选择员工、类别、项目和有效比例' });
  const tenantId = req.admin.tenantId;
  const staff = await Admin.findOne({ _id: staffId, tenantId, staffStatus: 'active' }).select('_id').lean();
  if (!staff) return res.status(404).json({ success: false, message: '本机构在职员工不存在' });
  const categoryName = String(category).trim();
  const products = await Product.find({ _id: { $in: productIds }, tenantId, category: categoryName,
    status: 'on' }).select('_id').lean();
  const packages = categoryName === '365会员' ? await ServicePackage.find({ _id: { $in: productIds },
    active: true, 'activation.enabled': true, 'configuration.membershipTier': 'consumer365' })
    .select('_id').lean() : [];
  if (products.length + packages.length !== productIds.length)
    return res.status(400).json({ success: false, message: '项目须属于所选类别且正在销售' });
  const now = new Date();
  const latest = await StaffCommissionRule.findOne({ tenantId, staffId, category: categoryName })
    .sort({ version: -1 }).select('version').lean();
  try {
    const row = await StaffCommissionRule.create({ tenantId, staffId, category: categoryName,
      productIds, version: (latest?.version || 0) + 1, effectiveFrom: now,
      referrerRate: Number(referrerRate), fulfillerRate: Number(fulfillerRate), createdBy: req.admin._id });
    await StaffCommissionRule.updateMany({ tenantId, staffId, category: categoryName,
      productIds: { $size: 1, $all: productIds },
      _id: { $ne: row._id }, effectiveUntil: null }, { $set: { effectiveUntil: now } });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(error?.code === 11000 ? 409 : 500).json({ success: false,
      message: error?.code === 11000 ? '规则版本已变化，请刷新后重试' : '保存员工规则失败' });
  }
});

router.post('/staff/:id/remove-promotion', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.body?.productId))
    return res.status(400).json({ success: false, message: '员工佣金规则无效' });
  const tenantId = req.admin.tenantId;
  const current = await StaffCommissionRule.findOne({ _id: req.params.id, tenantId, effectiveUntil: null }).lean();
  if (!current) return res.status(404).json({ success: false, message: '当前员工规则不存在' });
  if (!(current.productIds || []).some(id => String(id) === String(req.body.productId)))
    return res.status(409).json({ success: false, message: '该产品不属于此规则' });
  const now = new Date();
  const latest = await StaffCommissionRule.findOne({ tenantId, staffId: current.staffId,
    category: current.category }).sort({ version: -1 }).select('version').lean();
  try {
    const row = await StaffCommissionRule.create({ tenantId, staffId: current.staffId,
      category: current.category, productIds: [req.body.productId],
      version: (latest?.version || 0) + 1, effectiveFrom: now,
      referrerRate: 0, fulfillerRate: current.fulfillerRate, createdBy: req.admin._id });
    await StaffCommissionRule.updateMany({ tenantId, staffId: current.staffId,
      productIds: { $size: 1, $all: [req.body.productId] }, _id: { $ne: row._id }, effectiveUntil: null },
    { $set: { effectiveUntil: now } });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false,
      message: error.code === 11000 ? '规则版本已变化，请刷新后重试' : '移除推广佣金失败' });
  }
});

router.get('/partners', async (req, res) => {
  const rows = await MarketPartnerRule.find({ tenantId: req.admin.tenantId,
    partnerId: { $ne: null } }).sort({ createdAt: -1 }).limit(1000).lean();
  res.json({ success: true, data: rows });
});

router.post('/partners', async (req, res) => {
  const { partnerId, productLine, category, productIds, kind, firstPercent, renewals } = req.body || {};
  const yearRows = Array.isArray(renewals) ? renewals : [];
  if (!mongoose.isValidObjectId(partnerId) || !String(productLine || '').trim()
    || !String(category || '').trim() || !validIds(productIds) || productIds.length !== 1
    || !['annual', 'first', 'every'].includes(kind) || !validRate(firstPercent)
    || yearRows.length > 19 || yearRows.some(row => !Number.isSafeInteger(Number(row.year))
      || Number(row.year) < 2 || Number(row.year) > 20 || !validRate(row.percent))
    || new Set(yearRows.map(row => Number(row.year))).size !== yearRows.length)
    return res.status(400).json({ success: false, message: '请选择合伙人、类别、项目及有效佣金比例' });
  const tenantId = req.admin.tenantId;
  const partner = await MarketPartner.findOne({ _id: partnerId, tenantId,
    status: { $in: ['draft', 'active', 'suspended'] } }).select('_id productLine segment').lean();
  if (!partner) return res.status(404).json({ success: false, message: '本机构合伙人或授权类别不存在' });
  const sourceType = category === '365会员' ? 'servicePackage' : 'product';
  const ruleLine = partner.segment ? (sourceType === 'servicePackage' ? 'consumer365' : category) : productLine;
  if (!partner.segment && productLine !== partner.productLine)
    return res.status(409).json({ success: false, message: '旧合伙人产品线不一致' });
  const found = sourceType === 'servicePackage'
    ? await ServicePackage.find({ _id: { $in: productIds }, active: true, 'activation.enabled': true,
      'configuration.membershipTier': 'consumer365', 'configuration.includes365': true }).select('_id').lean()
    : await Product.find({ _id: { $in: productIds }, tenantId, category,
      status: 'on' }).select('_id').lean();
  if (sourceType === 'servicePackage' && category !== '365会员')
    return res.status(400).json({ success: false, message: '365会员服务包类别无效' });
  if (found.length !== productIds.length)
    return res.status(400).json({ success: false, message: '所选项目不在本机构可售范围' });
  const now = new Date();
  const existing = await MarketPartnerRule.find({ tenantId, partnerId, productLine: ruleLine, category,
    productId: productIds[0],
    status: 'active', effectiveUntil: null }).lean();
  try {
    const rows = [];
    for (const productId of productIds) {
      const latest = await MarketPartnerRule.findOne({ tenantId, productId }).sort({ version: -1 }).select('version').lean();
      rows.push({ tenantId, productId, partnerId, sourceType, productLine: ruleLine, category,
        version: (latest?.version || 0) + 1, status: 'active', effectiveFrom: now,
        kind, firstBasisPoints: Math.round(Number(firstPercent) * 100),
        renewalBasisPoints: kind === 'annual' ? yearRows.map(row => ({ year: Number(row.year),
          basisPoints: Math.round(Number(row.percent) * 100) })) : [],
        createdBy: req.admin._id, publishedBy: req.admin._id, publishedAt: now });
    }
    const saved = await MarketPartnerRule.insertMany(rows);
    await MarketPartnerRule.updateMany({ _id: { $in: existing.map(row => row._id) } },
      { $set: { effectiveUntil: now, status: 'retired' } });
    res.status(201).json({ success: true, data: saved });
  } catch (error) {
    res.status(error?.code === 11000 ? 409 : 500).json({ success: false,
      message: error?.code === 11000 ? '规则版本已变化，请刷新后重试' : '保存合伙人规则失败，请核对现有版本' });
  }
});

router.post('/partners/:id/remove-promotion', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ success: false, message: '合伙人佣金规则无效' });
  const tenantId = req.admin.tenantId;
  const current = await MarketPartnerRule.findOne({ _id: req.params.id, tenantId,
    partnerId: { $ne: null }, status: 'active', effectiveUntil: null }).lean();
  if (!current) return res.status(404).json({ success: false, message: '当前合伙人规则不存在' });
  const now = new Date();
  const latest = await MarketPartnerRule.findOne({ tenantId, productId: current.productId })
    .sort({ version: -1 }).select('version').lean();
  try {
    const row = await MarketPartnerRule.create({ tenantId, productId: current.productId,
      partnerId: current.partnerId, sourceType: current.sourceType,
      productLine: current.productLine, category: current.category,
      version: (latest?.version || 0) + 1, status: 'active', disabled: true,
      effectiveFrom: now, kind: current.kind, firstBasisPoints: 0,
      tierBasisPoints: [], renewalBasisPoints: [], directReferralRequired: current.directReferralRequired,
      createdBy: req.admin._id, publishedBy: req.admin._id, publishedAt: now });
    await MarketPartnerRule.updateMany({ tenantId, partnerId: current.partnerId,
      productId: current.productId, _id: { $ne: row._id }, status: 'active', effectiveUntil: null },
    { $set: { effectiveUntil: now, status: 'retired' } });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 500).json({ success: false,
      message: error.code === 11000 ? '规则版本已变化，请刷新后重试' : '移除推广佣金失败' });
  }
});

module.exports = router;
