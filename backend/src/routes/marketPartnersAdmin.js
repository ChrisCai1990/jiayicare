const router = require('express').Router();
const crypto = require('crypto');
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const MarketPartner = require('../models/MarketPartner');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const TeamIncentiveRule = require('../models/TeamIncentiveRule');
const MarketPartnerCommission = require('../models/MarketPartnerCommission');
const MarketPartnerReceipt = require('../models/MarketPartnerReceipt');
const TeamIncentive = require('../models/TeamIncentive');
const Fulfillment = require('../models/Fulfillment');
const Admin = require('../models/Admin');
const Commission = require('../models/Commission');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { commissionCents } = require('../utils/partnerCommissionPolicy');
const { teamIncentiveCents } = require('../utils/teamIncentivePolicy');

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

router.patch('/rules/:id/end', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  const effectiveUntil = new Date(req.body?.effectiveUntil);
  if (!Number.isFinite(effectiveUntil.getTime()) || effectiveUntil <= new Date())
    return res.status(400).json({ success: false, message: '结束时间须晚于当前时间，历史订单规则不可追改' });
  try {
    const row = await MarketPartnerRule.findOneAndUpdate({ _id: req.params.id, tenantId: tenant(req),
      status: 'active', $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: effectiveUntil } }] },
    { $set: { effectiveUntil } }, { new: true });
    if (!row) return res.status(409).json({ success: false, message: '规则不存在或结束时间未提前' });
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

router.patch('/team-rules/:id/end', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  const effectiveUntil = new Date(req.body?.effectiveUntil);
  if (!Number.isFinite(effectiveUntil.getTime()) || effectiveUntil <= new Date())
    return res.status(400).json({ success: false, message: '结束时间须晚于当前时间，历史订单规则不可追改' });
  try {
    const row = await TeamIncentiveRule.findOneAndUpdate({ _id: req.params.id, tenantId: tenant(req),
      status: 'active', $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: effectiveUntil } }] },
    { $set: { effectiveUntil } }, { new: true });
    if (!row) return res.status(409).json({ success: false, message: '规则不存在或结束时间未提前' });
    res.json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.get('/team-incentives', async (req, res) => {
  try {
    const rows = await TeamIncentive.find({ tenantId: tenant(req) }).sort({ createdAt: -1 }).limit(200)
      .populate('orderId', 'orderNo serviceName').populate('staffId', 'name role').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/team-incentives', async (req, res) => {
  if (!validId(req.body?.orderId) || !validId(req.body?.staffId))
    return res.status(400).json({ success: false, message: '请选择订单和实际服务人员' });
  const role = String(req.body?.role || '');
  if (!['familyDoctor', 'nutritionist', 'healthManager'].includes(role))
    return res.status(400).json({ success: false, message: '岗位无效' });
  try {
    const order = await Order.findOne({ _id: req.body.orderId, tenantId: tenant(req), paymentStatus: 'paid' });
    if (!order || ['refunded', 'requested', 'processing'].includes(order.refundStatus))
      return res.status(409).json({ success: false, message: '订单未付款或退款待处理' });
    const product = await Product.findOne({ _id: order.serviceId, tenantId: tenant(req) }).select('_id').lean();
    const evidence = await Fulfillment.findOne({ order: order._id, status: 'completed', completedAt: { $ne: null } });
    const staff = await Admin.findOne({ _id: req.body.staffId, tenantId: tenant(req), role }).select('_id').lean();
    if (!product || !evidence || !staff)
      return res.status(409).json({ success: false, message: '商品、已完成履约记录或服务人员岗位未核实' });
    if (await Commission.exists({ orderId: order._id, staffId: staff._id, role: 'fulfiller',
      status: { $ne: 'cancelled' } }))
      return res.status(409).json({ success: false, message: '该人员已有本单现行服务绩效，不可重复计提' });
    const verified = await require('../utils/marketPartnerSettlement').verifiedCashCents(order);
    if (verified === null) return res.status(409).json({ success: false, message: '现金收款尚未核实' });
    const basisCents = Math.max(0, verified - await require('../utils/marketPartnerSettlement').refundedCashCents(order._id));
    const at = order.paidAt;
    const rule = await TeamIncentiveRule.findOne({ tenantId: tenant(req), productId: product._id,
      specificationLabel: order.specificationLabel || '', role, trigger: 'service_completed', status: 'active',
      effectiveFrom: { $lte: at }, $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] })
      .sort({ version: -1 }).lean();
    if (!rule) return res.status(409).json({ success: false, message: '付款时无适用的团队激励规则' });
    const amountCents = teamIncentiveCents({ role, ruleType: rule.ruleType, basisCents,
      basisPoints: rule.basisPoints, amountCents: rule.amountCents, capCents: rule.capCents });
    const row = await TeamIncentive.create({ tenantId: tenant(req), orderId: order._id,
      staffId: staff._id, role, trigger: rule.trigger, serviceEvidenceId: evidence._id,
      ruleId: rule._id, ruleVersion: rule.version, basisCents, amountCents,
      submittedBy: req.admin._id, note: String(req.body?.note || '').trim().slice(0, 500) });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '同一履约贡献已计提' });
    fail(res, err);
  }
});

router.patch('/team-incentives/:id/confirm', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效激励记录' });
  try {
    const row = await TeamIncentive.findOne({ _id: req.params.id, tenantId: tenant(req), status: 'pending' });
    if (!row) return res.status(404).json({ success: false, message: '待审核激励不存在' });
    if (String(row.submittedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '计提人与审核人须为不同人员' });
    const evidence = await Fulfillment.findOne({ _id: row.serviceEvidenceId,
      order: row.orderId, status: 'completed' });
    if (!evidence) return res.status(409).json({ success: false, message: '履约证据状态已变化' });
    const updated = await TeamIncentive.findOneAndUpdate({ _id: row._id, status: 'pending' },
      { $set: { status: 'confirmed', confirmedAt: new Date(), confirmedBy: req.admin._id } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '激励状态已变化' });
    res.json({ success: true, data: updated });
  } catch (err) { fail(res, err); }
});

router.get('/receipts', async (req, res) => {
  try {
    const rows = await MarketPartnerReceipt.find({ tenantId: tenant(req) }).sort({ createdAt: -1 })
      .limit(200).populate('orderId', 'orderNo serviceName paidAmount paidAt paymentStatus').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/receipts', async (req, res) => {
  if (!validId(req.body?.orderId)) return res.status(400).json({ success: false, message: '无效订单' });
  try {
    const order = await Order.findOne({ _id: req.body.orderId, tenantId: tenant(req) });
    if (!order || !order.marketPartnerId || order.paymentMethod !== 'onsite' || order.paymentStatus !== 'paid')
      return res.status(409).json({ success: false, message: '仅可核对已登记线下收款的合伙人订单' });
    const amountCents = Number(req.body.amountCents);
    const reference = String(req.body.reference || '').trim();
    const evidence = String(req.body.evidence || '').trim();
    const receivedAt = new Date(req.body.receivedAt);
    if (amountCents !== Math.round(Number(order.paidAmount) * 100) || !reference || reference.length > 120
      || !evidence || evidence.length > 500 || !Number.isFinite(receivedAt.getTime()) || receivedAt > new Date())
      return res.status(400).json({ success: false, message: '请核对实收金额、收款流水号、到账日期及凭据说明' });
    const previous = await MarketPartnerReceipt.findOne({ tenantId: tenant(req), orderId: order._id });
    if (previous && previous.status !== 'rejected')
      return res.status(409).json({ success: false, message: '该订单已有待复核或已通过的收款凭据' });
    const row = previous ? await MarketPartnerReceipt.findOneAndUpdate({ _id: previous._id, status: 'rejected' },
      { $push: { reviewHistory: { status: previous.status, reference: previous.reference,
        amountCents: previous.amountCents, reviewedBy: previous.reviewedBy,
        reviewedAt: previous.reviewedAt, reviewNote: previous.reviewNote } },
      $set: { status: 'submitted', amountCents, reference, evidence, receivedAt,
        submittedBy: req.admin._id, reviewedBy: null, reviewedAt: null, reviewNote: '' } }, { new: true })
      : await MarketPartnerReceipt.create({ tenantId: tenant(req), orderId: order._id,
        amountCents, reference, evidence, receivedAt, submittedBy: req.admin._id });
    if (!row) return res.status(409).json({ success: false, message: '凭据状态已变化，请刷新' });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '该订单或收款流水号已登记' });
    fail(res, err);
  }
});

router.patch('/receipts/:id/review', async (req, res) => {
  if (!validId(req.params.id) || !['approved', 'rejected'].includes(req.body?.status))
    return res.status(400).json({ success: false, message: '复核状态无效' });
  try {
    const row = await MarketPartnerReceipt.findOne({ _id: req.params.id,
      tenantId: tenant(req), status: 'submitted' });
    if (!row) return res.status(404).json({ success: false, message: '待复核凭据不存在' });
    if (String(row.submittedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '收款登记人与复核人须为不同人员' });
    const order = await Order.findOne({ _id: row.orderId, tenantId: tenant(req) });
    if (!order || order.paymentStatus !== 'paid' || order.paymentMethod !== 'onsite'
      || row.amountCents !== Math.round(Number(order.paidAmount) * 100))
      return res.status(409).json({ success: false, message: '订单支付状态或金额已变化，不能复核' });
    const updated = await MarketPartnerReceipt.findOneAndUpdate({ _id: row._id, status: 'submitted' },
      { $set: { status: req.body.status, reviewedBy: req.admin._id, reviewedAt: new Date(),
        reviewNote: String(req.body.reviewNote || '').trim().slice(0, 500) } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '复核状态已变化' });
    if (updated.status === 'approved') await require('../utils/marketPartnerSettlement').syncOrder(order);
    res.json({ success: true, data: updated });
  } catch (err) { fail(res, err); }
});

router.get('/commissions', async (req, res) => {
  try {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const filter = { tenantId: tenant(req) };
    if (req.query.partnerId && validId(req.query.partnerId)) filter.partnerId = req.query.partnerId;
    if (req.query.status && ['estimated', 'pending', 'partially_paid', 'paid', 'cancelled', 'reversal_due'].includes(req.query.status))
      filter.status = req.query.status;
    const [rows, total] = await Promise.all([
      MarketPartnerCommission.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50)
        .populate('partnerId', 'name referralCode').populate('orderId', 'orderNo serviceName paidAt refundStatus paymentStatus').lean(),
      MarketPartnerCommission.countDocuments(filter),
    ]);
    res.json({ success: true, data: { rows, total, page } });
  } catch (err) { fail(res, err); }
});

router.patch('/commissions/:id/pay', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效佣金记录' });
  const amountCents = req.body?.amountCents;
  const paymentReference = String(req.body?.paymentReference || '').trim();
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !/^[A-Za-z0-9_.-]{6,80}$/.test(paymentReference))
    return res.status(400).json({ success: false, message: '请填写已实际转账金额（分）及凭证号' });
  try {
    const before = await MarketPartnerCommission.findOne({ _id: req.params.id, tenantId: tenant(req) });
    if (!before) return res.status(404).json({ success: false, message: '佣金记录不存在' });
    const order = await Order.findOne({ _id: before.orderId, tenantId: tenant(req) });
    if (!order) return res.status(409).json({ success: false, message: '来源订单不存在' });
    await require('../utils/marketPartnerSettlement').syncOrder(order);
    const row = await MarketPartnerCommission.findOne({ _id: before._id, tenantId: tenant(req) });
    const now = new Date();
    if (!row?.firstEligibleAt || now < row.firstEligibleAt || ['requested', 'processing'].includes(order.refundStatus)
      || ['cancelled', 'reversal_due'].includes(row.status))
      return res.status(409).json({ success: false, message: '尚未达到发放条件或退款待核对' });
    const limit = row.finalEligibleAt && now >= row.finalEligibleAt
      ? row.accruedCents : Math.floor(row.accruedCents / 2);
    if (row.paidCents + amountCents > limit)
      return res.status(409).json({ success: false, message: `当前最多还可登记 ${(Math.max(0, limit - row.paidCents) / 100).toFixed(2)} 元` });
    const ledgerKey = `pay:${paymentReference}`;
    const updated = await MarketPartnerCommission.findOneAndUpdate({ _id: row._id,
      tenantId: tenant(req), paidCents: row.paidCents, updatedAt: row.updatedAt,
      'ledger.key': { $ne: ledgerKey } }, {
      $inc: { paidCents: amountCents },
      $addToSet: { paymentReferences: paymentReference },
      $set: { status: row.paidCents + amountCents === row.accruedCents ? 'paid' : 'partially_paid' },
      $push: { ledger: { key: ledgerKey, kind: 'payment', amountCents, at: now,
        actorId: req.admin._id, reason: '人工确认已完成转账' } },
    }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '记录已变化或凭证号已使用，请刷新核对' });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '转账凭证号已用于其他佣金记录' });
    fail(res, err);
  }
});

module.exports = router;
