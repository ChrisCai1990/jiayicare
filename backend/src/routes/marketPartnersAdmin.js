const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const MarketPartner = require('../models/MarketPartner');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const TeamIncentiveRule = require('../models/TeamIncentiveRule');
const Product = require('../models/Product');
const { commissionCents } = require('../utils/partnerCommissionPolicy');

router.use(adminAuth);
router.use((req, res, next) => req.admin.role === 'superadmin' && req.admin.tenantId
  ? next() : res.status(403).json({ success: false, message: '仅机构超级管理员可管理市场合伙人规则' }));

const fail = (res, err) => res.status(err?.name === 'ValidationError' ? 400 : 500)
  .json({ success: false, message: err?.name === 'ValidationError' ? err.message : '操作失败' });
const validId = value => mongoose.Types.ObjectId.isValid(value);
const tenant = req => req.admin.tenantId;

router.get('/', async (req, res) => {
  try {
    const rows = await MarketPartner.find({ tenantId: tenant(req) }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const productLine = String(req.body?.productLine || '').trim();
    if (!name || !/^1\d{10}$/.test(phone) || !productLine)
      return res.status(400).json({ success: false, message: '请填写名称、手机号和授权产品线' });
    const row = await MarketPartner.create({ tenantId: tenant(req), name, phone, productLine,
      contractReference: String(req.body?.contractReference || '').trim().slice(0, 150),
      referralCode: crypto.randomBytes(6).toString('hex').toUpperCase() });
    res.status(201).json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.patch('/:id/status', async (req, res) => {
  if (!validId(req.params.id) || !['active', 'suspended', 'closed'].includes(req.body?.status))
    return res.status(400).json({ success: false, message: '无效的合伙人或状态' });
  try {
    const row = await MarketPartner.findOne({ _id: req.params.id, tenantId: tenant(req) });
    if (!row) return res.status(404).json({ success: false, message: '合伙人不存在' });
    if (req.body.status === 'active' && !row.contractReference)
      return res.status(409).json({ success: false, message: '需先登记合作合同编号' });
    row.status = req.body.status;
    if (row.status === 'active' && !row.approvedAt) { row.approvedAt = new Date(); row.approvedBy = req.admin._id; }
    await row.save();
    res.json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.get('/rules', async (req, res) => {
  try {
    const rows = await MarketPartnerRule.find({ tenantId: tenant(req) }).sort({ productId: 1, version: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/rules', async (req, res) => {
  if (!validId(req.body?.productId)) return res.status(400).json({ success: false, message: '无效商品' });
  try {
    const product = await Product.findOne({ _id: req.body.productId, tenantId: tenant(req) }).select('_id').lean();
    if (!product) return res.status(404).json({ success: false, message: '商品不存在' });
    const latest = await MarketPartnerRule.findOne({ tenantId: tenant(req), productId: product._id }).sort({ version: -1 }).select('version').lean();
    const row = await MarketPartnerRule.create({ tenantId: tenant(req), productId: product._id,
      productLine: String(req.body.productLine || '').trim(), version: (latest?.version || 0) + 1,
      kind: req.body.kind, firstBasisPoints: req.body.firstBasisPoints,
      tierBasisPoints: req.body.tierBasisPoints || [], renewalBasisPoints: req.body.renewalBasisPoints || [],
      directReferralRequired: req.body.directReferralRequired === true,
      quickCloseEnabled: req.body.quickCloseEnabled === true,
      quickCloseCapCents: req.body.quickCloseCapCents ?? 100000,
      retentionFloorBasisPoints: req.body.retentionFloorBasisPoints ?? null,
      effectiveFrom: req.body.effectiveFrom, effectiveUntil: req.body.effectiveUntil || null,
      createdBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.patch('/rules/:id/publish', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  try {
    const row = await MarketPartnerRule.findOne({ _id: req.params.id, tenantId: tenant(req), status: 'draft' });
    if (!row) return res.status(404).json({ success: false, message: '草稿规则不存在' });
    const overlap = await MarketPartnerRule.exists({ tenantId: tenant(req), productId: row.productId,
      status: 'active', effectiveFrom: { $lt: row.effectiveUntil || new Date('9999-12-31') },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: row.effectiveFrom } }] });
    if (overlap) return res.status(409).json({ success: false, message: '与已生效规则时间重叠，请先结束旧规则' });
    row.status = 'active'; row.publishedAt = new Date(); row.publishedBy = req.admin._id;
    await row.save();
    res.json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.post('/rules/preview', async (req, res) => {
  if (!validId(req.body?.ruleId)) return res.status(400).json({ success: false, message: '无效规则' });
  try {
    const row = await MarketPartnerRule.findOne({ _id: req.body.ruleId, tenantId: tenant(req) }).lean();
    if (!row) return res.status(404).json({ success: false, message: '规则不存在' });
    const paidCents = req.body.paidCents;
    const policy = { kind: row.kind, first: row.firstBasisPoints, tiers: row.tierBasisPoints.length ? row.tierBasisPoints : null,
      renewals: Object.fromEntries(row.renewalBasisPoints.map(item => [item.year, item.basisPoints])),
      directReferralRequired: row.directReferralRequired, quickClose: row.quickCloseEnabled };
    const result = commissionCents({ paidCents, policy, periodNumber: req.body.periodNumber || 1,
      monthlyQualifiedCount: req.body.monthlyQualifiedCount || 1, directReferral: req.body.directReferral === true,
      firstConversationAt: req.body.firstConversationAt, paidAt: req.body.paidAt,
      quickCloseCapCents: row.quickCloseCapCents });
    res.json({ success: true, data: { ...result, ruleId: row._id, ruleVersion: row.version } });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

router.get('/team-rules', async (req, res) => {
  try {
    const rows = await TeamIncentiveRule.find({ tenantId: tenant(req) }).sort({ productId: 1, version: -1 }).lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/team-rules', async (req, res) => {
  if (!validId(req.body?.productId)) return res.status(400).json({ success: false, message: '无效商品' });
  try {
    const product = await Product.findOne({ _id: req.body.productId, tenantId: tenant(req) }).select('_id').lean();
    if (!product) return res.status(404).json({ success: false, message: '商品不存在' });
    const key = { tenantId: tenant(req), productId: product._id,
      specificationLabel: String(req.body.specificationLabel || '').trim(), role: req.body.role,
      trigger: String(req.body.trigger || '').trim() };
    const latest = await TeamIncentiveRule.findOne(key).sort({ version: -1 }).select('version').lean();
    const row = await TeamIncentiveRule.create({ ...key, version: (latest?.version || 0) + 1,
      ruleType: req.body.ruleType, basisPoints: req.body.basisPoints || 0,
      amountCents: req.body.amountCents || 0, capCents: req.body.capCents ?? null,
      effectiveFrom: req.body.effectiveFrom, effectiveUntil: req.body.effectiveUntil || null,
      createdBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.patch('/team-rules/:id/publish', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  try {
    const row = await TeamIncentiveRule.findOne({ _id: req.params.id, tenantId: tenant(req), status: 'draft' });
    if (!row) return res.status(404).json({ success: false, message: '草稿规则不存在' });
    const overlap = await TeamIncentiveRule.exists({ tenantId: tenant(req), productId: row.productId,
      specificationLabel: row.specificationLabel, role: row.role, trigger: row.trigger,
      status: 'active', effectiveFrom: { $lt: row.effectiveUntil || new Date('9999-12-31') },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: row.effectiveFrom } }] });
    if (overlap) return res.status(409).json({ success: false, message: '与已生效规则时间重叠，请先结束旧规则' });
    row.status = 'active';
    await row.save();
    res.json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

module.exports = router;
