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
const Refund = require('../models/Refund');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const MarketPartnerAttribution = require('../models/MarketPartnerAttribution');
const MarketPartnerLoss = require('../models/MarketPartnerLoss');
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

router.get('/offline-orders', async (req, res) => {
  try {
    const rows = await Order.find({ tenantId: tenant(req), marketPartnerContractReference: { $type: 'string' } })
      .sort({ createdAt: -1 }).limit(200).populate('marketPartnerId', 'name referralCode')
      .populate('user', 'name phone').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/offline-orders', async (req, res) => {
  const { productId, patientId } = req.body || {};
  if (!validId(productId) || !validId(patientId))
    return res.status(400).json({ success: false, message: '请选择有效客户与商品' });
  const contractReference = String(req.body.contractReference || '').trim();
  const code = String(req.body.partnerCode || '').trim().toUpperCase();
  const specificationLabel = String(req.body.specificationLabel || '').trim();
  if (!/^[A-Za-z0-9_.-]{6,100}$/.test(contractReference) || !/^[A-F0-9]{12}$/.test(code))
    return res.status(400).json({ success: false, message: '请填写合同编号及合伙人推荐码' });
  let claimedAttributionId = null;
  let createdOrder = false;
  try {
    const [product, patient] = await Promise.all([
      Product.findOne({ _id: productId, tenantId: tenant(req), status: 'on', paymentChannel: 'offline' }),
      User.findOne({ _id: patientId, tenantId: tenant(req), isDeleted: { $ne: true } }).select('_id name tenantId'),
    ]);
    if (!product || !patient) return res.status(404).json({ success: false, message: '本机构线下商品或客户不存在' });
    if (product.stockLimited || product.memberBundle?.enabled || product.serviceItems?.length)
      return res.status(409).json({ success: false, message: '该商品有库存或组合权益，请使用现有购买流程' });
    const sku = specificationLabel ? (product.skus || []).find(item => item.label === specificationLabel && item.active !== false) : null;
    const listed = specificationLabel ? (sku?.price ?? (product.servicePrices || []).find(item => item.label === specificationLabel)?.price)
      : product.originalPrice;
    if (!Number.isFinite(listed) || listed <= 0 || Math.round(listed * 100) !== Number(req.body.priceCents))
      return res.status(409).json({ success: false, message: '合同金额须与当前商品规格价格一致，请核对' });
    if (await Order.exists({ tenantId: tenant(req), marketPartnerContractReference: contractReference }))
      return res.status(409).json({ success: false, message: '该合同编号已有订单' });
    const applicableRule = await require('../utils/marketPartnerAttribution').activeRule(tenant(req), product._id);
    if (applicableRule?.productLine === 'consumer365')
      return res.status(409).json({ success: false, message: '365 会员须走商城下单' });
    const match = await require('../utils/marketPartnerAttribution').claim({ tenantId: tenant(req),
      patientId: patient._id, productId: product._id, code });
    if (!match) return res.status(409).json({ success: false, message: '推荐码无效，或该合伙人未获此商品授权' });
    claimedAttributionId = match.attribution._id;
    const order = await Order.create({ user: patient._id, payerUser: patient._id,
      beneficiaryName: patient.name || '', tenantId: tenant(req), serviceId: String(product._id),
      serviceName: product.name, servicePrice: listed, unitPrice: listed,
      specificationLabel, skuCode: sku?.code || '', totalUnits: sku?.totalUnits || 1,
      orderNo: `MP${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      orderType: 'product', fulfillmentType: sku?.fulfillmentType || product.fulfillmentType,
      tradeStatus: 'awaiting_payment', paymentStatus: 'unpaid', paymentMethod: '',
      paymentExpectedAmount: listed, initiationSource: 'admin',
      serviceWorkflowSnapshot: product.serviceWorkflow?.toObject?.() || product.serviceWorkflow || null,
      serviceProviderSnapshot: { code: product.serviceProvider || 'platform', companyName: '杭州嘉医汇健康管理有限公司' },
      marketPartnerId: match.attribution.partnerId, marketPartnerAttributionId: match.attribution._id,
      marketPartnerRuleId: match.rule._id, marketPartnerRuleVersion: match.rule.version,
      marketPartnerContractReference: contractReference,
      note: `线下合同订单：${contractReference}` });
    createdOrder = true;
    await MarketPartnerAttribution.updateOne({ _id: match.attribution._id, tenantId: tenant(req) },
      { $set: { orderId: order._id } });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    if (claimedAttributionId && !createdOrder)
      await MarketPartnerAttribution.deleteOne({ _id: claimedAttributionId, orderId: null });
    if (err.code === 11000) return res.status(409).json({ success: false, message: '合同编号或订单已存在' });
    fail(res, err);
  }
});

router.get('/offline-refunds', async (req, res) => {
  try {
    const orderIds = await Order.distinct('_id', { tenantId: tenant(req),
      marketPartnerId: { $ne: null }, paymentMethod: 'onsite' });
    const rows = await Refund.find({ order: { $in: orderIds },
      marketPartnerOfflineReference: { $type: 'string' } })
      .sort({ createdAt: -1 }).limit(200).populate('order', 'orderNo serviceName').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/offline-orders/:id/refunds', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效订单' });
  try {
    const order = await Order.findOne({ _id: req.params.id, tenantId: tenant(req),
      marketPartnerId: { $ne: null }, paymentMethod: 'onsite', paymentStatus: 'paid' });
    if (!order) return res.status(409).json({ success: false, message: '线下已付款订单不存在' });
    if (await Refund.exists({ order: order._id, status: { $in: ['requested', 'processing'] } }))
      return res.status(409).json({ success: false, message: '该订单已有待复核退款' });
    const amountCents = Number(req.body?.amountCents);
    const reference = String(req.body?.reference || '').trim();
    const evidence = String(req.body?.evidence || '').trim();
    const refundableCents = Math.round(Number(order.paidAmount - order.refundedAmount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > refundableCents
      || !/^[A-Za-z0-9_.-]{6,120}$/.test(reference) || !evidence || evidence.length > 500)
      return res.status(400).json({ success: false, message: '请核对实际已退金额、退款流水号和转账凭据' });
    const row = await Refund.create({ order: order._id, user: order.user, payment: null,
      requestedBy: req.admin._id, amount: amountCents / 100, totalAmount: order.paidAmount,
      reason: String(req.body.reason || '线下合同退款').trim().slice(0, 500),
      outRefundNo: `MR${Date.now()}${crypto.randomBytes(5).toString('hex')}`,
      marketPartnerOfflineReference: reference, marketPartnerOfflineEvidence: evidence,
      marketPartnerOfflineSubmittedBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '退款流水号已登记' });
    fail(res, err);
  }
});

router.patch('/offline-refunds/:id/confirm', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效退款' });
  try {
    const refund = await Refund.findOne({ _id: req.params.id, status: { $in: ['requested', 'processing'] },
      marketPartnerOfflineReference: { $type: 'string' } });
    const order = refund && await Order.findOne({ _id: refund.order, tenantId: tenant(req),
      marketPartnerId: { $ne: null }, paymentMethod: 'onsite', paymentStatus: 'paid' });
    if (!refund || !order) return res.status(404).json({ success: false, message: '待复核线下退款不存在' });
    if (String(refund.marketPartnerOfflineSubmittedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '退款登记者与复核人须为不同人员' });
    if (refund.status === 'processing' && (String(refund.marketPartnerOfflineReviewedBy) !== String(req.admin._id)
      || new Date(refund.updatedAt).getTime() > Date.now() - 60000))
      return res.status(409).json({ success: false, message: '退款正在入账；如超时，请原复核人重试' });
    const refundableCents = Math.round(Number(order.paidAmount - order.refundedAmount) * 100);
    if (Math.round(refund.amount * 100) > refundableCents)
      return res.status(409).json({ success: false, message: '可退余额已变化' });
    const claimed = refund.status === 'processing' ? refund
      : await Refund.findOneAndUpdate({ _id: refund._id, status: 'requested' },
        { $set: { status: 'processing', marketPartnerOfflineReviewedBy: req.admin._id } }, { new: true });
    if (!claimed) return res.status(409).json({ success: false, message: '退款状态已变化' });
    const updatedOrder = await require('../utils/orderSettlement').confirmRefund(claimed,
      { source: 'market_partner_offline_refund', reference: claimed.marketPartnerOfflineReference });
    res.json({ success: true, data: { refund: await Refund.findById(claimed._id), order: updatedOrder } });
  } catch (err) { fail(res, err); }
});

router.get('/loss-reviews', async (req, res) => {
  try {
    const rows = await MarketPartnerLoss.find({ tenantId: tenant(req) }).sort({ createdAt: -1 }).limit(200)
      .populate('orderId', 'orderNo serviceName paidAt').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/loss-reviews', async (req, res) => {
  if (!validId(req.body?.orderId)) return res.status(400).json({ success: false, message: '无效订单' });
  try {
    const order = await Order.findOne({ _id: req.body.orderId, tenantId: tenant(req),
      marketPartnerId: { $ne: null }, paymentStatus: 'paid' });
    if (!order?.paidAt) return res.status(409).json({ success: false, message: '合伙人已付款订单不存在' });
    const terminatedAt = new Date(req.body.terminatedAt);
    const reason = String(req.body.reason || '').trim();
    const evidence = String(req.body.evidence || '').trim();
    const cutoff = new Date(order.paidAt).getTime() + 30 * 86400000;
    if (!Number.isFinite(terminatedAt.getTime()) || terminatedAt < order.paidAt
      || terminatedAt.getTime() > cutoff || terminatedAt > new Date()
      || !reason || reason.length > 500 || !evidence || evidence.length > 500)
      return res.status(400).json({ success: false, message: '须提交付款后30天内正式终止的日期、原因和合同或服务终止依据' });
    if (/未登录|未回复|暂停|投诉/.test(reason) && !/合同解除|正式终止|退费/.test(`${reason} ${evidence}`))
      return res.status(400).json({ success: false, message: '未登录、未回复、暂停或投诉不能单独作为流失依据' });
    const previous = await MarketPartnerLoss.findOne({ tenantId: tenant(req), orderId: order._id });
    if (previous && previous.status !== 'rejected')
      return res.status(409).json({ success: false, message: '该订单已有待审核或已通过的流失记录' });
    const row = previous ? await MarketPartnerLoss.findOneAndUpdate({ _id: previous._id, status: 'rejected' }, {
      $push: { reviewHistory: { reason: previous.reason, evidence: previous.evidence,
        terminatedAt: previous.terminatedAt, reviewedBy: previous.reviewedBy,
        reviewedAt: previous.reviewedAt, reviewNote: previous.reviewNote } },
      $set: { status: 'requested', terminatedAt, reason, evidence,
        requestedBy: req.admin._id, reviewedBy: null, reviewedAt: null, reviewNote: '' },
    }, { new: true }) : await MarketPartnerLoss.create({ tenantId: tenant(req), orderId: order._id,
      partnerId: order.marketPartnerId, terminatedAt, reason, evidence,
      requestedBy: req.admin._id });
    if (!row) return res.status(409).json({ success: false, message: '流失审核状态已变化，请刷新' });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '该订单已有流失审核记录' });
    fail(res, err);
  }
});

router.patch('/loss-reviews/:id/review', async (req, res) => {
  if (!validId(req.params.id) || !['approved', 'rejected'].includes(req.body?.status))
    return res.status(400).json({ success: false, message: '审核状态无效' });
  try {
    const row = await MarketPartnerLoss.findOne({ _id: req.params.id, tenantId: tenant(req),
      status: 'requested' });
    if (!row) return res.status(404).json({ success: false, message: '待审核记录不存在' });
    if (String(row.requestedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '提交人与审核人须为不同人员' });
    const order = await Order.findOne({ _id: row.orderId, tenantId: tenant(req) });
    if (!order || row.terminatedAt < order.paidAt
      || row.terminatedAt.getTime() > new Date(order.paidAt).getTime() + 30 * 86400000)
      return res.status(409).json({ success: false, message: '订单或30天终止日期已变化' });
    const updated = await MarketPartnerLoss.findOneAndUpdate({ _id: row._id, status: 'requested' },
      { $set: { status: req.body.status, reviewedBy: req.admin._id, reviewedAt: new Date(),
        reviewNote: String(req.body.reviewNote || '').trim().slice(0, 500) } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '审核状态已变化' });
    if (updated.status === 'approved') await require('../utils/marketPartnerSettlement').syncOrder(order);
    res.json({ success: true, data: updated });
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
    const directCostCents = req.body.directCostCents;
    const teamIncentiveCents = req.body.teamIncentiveCents;
    const transactionCostCents = req.body.transactionCostCents;
    const costsComplete = [directCostCents, teamIncentiveCents, transactionCostCents]
      .every(value => Number.isSafeInteger(value) && value >= 0);
    const retention = costsComplete ? require('../utils/marketPartnerRetention').retentionPreview({
      paidCents, directCostCents, teamIncentiveCents,
      partnerCommissionCents: result.totalCents, transactionCostCents,
      floorBasisPoints: row.retentionFloorBasisPoints ?? null }) : null;
    res.json({ success: true, data: { ...result, ruleId: row._id, ruleVersion: row.version,
      retention, costsComplete } });
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

router.patch('/team-incentives/:id/pay', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效激励记录' });
  const reference = String(req.body?.paymentReference || '').trim();
  if (!/^[A-Za-z0-9_.-]{6,80}$/.test(reference))
    return res.status(400).json({ success: false, message: '请填写实际转账凭证号' });
  try {
    const row = await TeamIncentive.findOne({ _id: req.params.id, tenantId: tenant(req),
      status: 'confirmed' });
    if (!row) return res.status(404).json({ success: false, message: '已审核待打款激励不存在' });
    const order = await Order.findOne({ _id: row.orderId, tenantId: tenant(req) });
    if (!order || !order.paidAt || order.paymentStatus !== 'paid'
      || ['requested', 'processing'].includes(order.refundStatus)
      || Date.now() < new Date(order.paidAt).getTime() + 30 * 86400000)
      return res.status(409).json({ success: false, message: '订单未达到付款后30天或退款仍在处理' });
    await require('../utils/teamIncentiveSettlement').syncOrder(order);
    const current = await TeamIncentive.findOne({ _id: row._id, tenantId: tenant(req), status: 'confirmed' });
    if (!current || current.amountCents <= 0)
      return res.status(409).json({ success: false, message: '激励金额已变化，请重新审核' });
    const updated = await TeamIncentive.findOneAndUpdate({ _id: current._id,
      status: 'confirmed', updatedAt: current.updatedAt, paymentReference: null },
    { $set: { status: 'paid', paidCents: current.amountCents, paidAt: new Date(),
      paidBy: req.admin._id, paymentReference: reference } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '激励状态已变化，请刷新' });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '转账凭证号已使用' });
    fail(res, err);
  }
});

router.patch('/team-incentives/:id/recover', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效激励记录' });
  const amountCents = Number(req.body?.amountCents);
  const reference = String(req.body?.recoveryReference || '').trim();
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !/^[A-Za-z0-9_.-]{6,80}$/.test(reference))
    return res.status(400).json({ success: false, message: '请填写已实际追回金额及凭证号' });
  try {
    const row = await TeamIncentive.findOne({ _id: req.params.id, tenantId: tenant(req),
      status: 'reversal_due' });
    if (!row) return res.status(404).json({ success: false, message: '待追回激励不存在' });
    const due = row.paidCents - (row.recoveredCents || 0) - row.amountCents;
    if (amountCents > due) return res.status(409).json({ success: false, message: '追回金额超过待追回余额' });
    const recoveredCents = (row.recoveredCents || 0) + amountCents;
    const status = row.paidCents - recoveredCents > row.amountCents ? 'reversal_due'
      : row.amountCents === 0 ? 'cancelled' : 'paid';
    const updated = await TeamIncentive.findOneAndUpdate({ _id: row._id,
      tenantId: tenant(req), status: 'reversal_due', updatedAt: row.updatedAt,
      recoveryReferences: { $ne: reference } }, {
      $inc: { recoveredCents: amountCents }, $addToSet: { recoveryReferences: reference },
      $set: { status }, $push: { adjustments: { basisCents: row.basisCents,
        amountCents: row.amountCents, at: new Date(), reason: `已追回 ${amountCents} 分，凭证 ${reference}` } },
    }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '记录已变化或凭证已使用' });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '追回凭证号已使用' });
    fail(res, err);
  }
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
    const netPaidCents = row.paidCents - (row.recoveredCents || 0);
    if (netPaidCents + amountCents > limit)
      return res.status(409).json({ success: false, message: `当前最多还可登记 ${(Math.max(0, limit - netPaidCents) / 100).toFixed(2)} 元` });
    const ledgerKey = `pay:${paymentReference}`;
    const updated = await MarketPartnerCommission.findOneAndUpdate({ _id: row._id,
      tenantId: tenant(req), paidCents: row.paidCents, updatedAt: row.updatedAt,
      'ledger.key': { $ne: ledgerKey } }, {
      $inc: { paidCents: amountCents },
      $addToSet: { paymentReferences: paymentReference },
      $set: { status: netPaidCents + amountCents === row.accruedCents ? 'paid' : 'partially_paid' },
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

router.patch('/commissions/:id/recover', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效佣金记录' });
  const amountCents = Number(req.body?.amountCents);
  const reference = String(req.body?.recoveryReference || '').trim();
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !/^[A-Za-z0-9_.-]{6,80}$/.test(reference))
    return res.status(400).json({ success: false, message: '请填写已实际追回金额及凭证号' });
  try {
    const row = await MarketPartnerCommission.findOne({ _id: req.params.id, tenantId: tenant(req) });
    if (!row) return res.status(404).json({ success: false, message: '佣金记录不存在' });
    const due = Math.max(0, row.paidCents - (row.recoveredCents || 0) - row.accruedCents);
    if (amountCents > due) return res.status(409).json({ success: false, message: '追回金额超过待追回余额' });
    const recoveredCents = (row.recoveredCents || 0) + amountCents;
    const nextStatus = require('../utils/marketPartnerSettlement').statusFor({
      accruedCents: row.accruedCents, paidCents: row.paidCents - recoveredCents,
      firstReady: !!row.firstEligibleAt && new Date() >= row.firstEligibleAt });
    const updated = await MarketPartnerCommission.findOneAndUpdate({ _id: row._id,
      tenantId: tenant(req), updatedAt: row.updatedAt, 'recoveryReferences': { $ne: reference } }, {
      $inc: { recoveredCents: amountCents }, $addToSet: { recoveryReferences: reference },
      $set: { status: nextStatus },
      $push: { ledger: { key: `recover:${reference}`, kind: 'recovery', amountCents: -amountCents,
        at: new Date(), actorId: req.admin._id, reason: '人工确认已追回' } },
    }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '记录已变化或凭证已使用' });
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '追回凭证号已使用' });
    fail(res, err);
  }
});

module.exports = router;
