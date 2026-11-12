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
const ServicePackage = require('../models/ServicePackage');
const User = require('../models/User');
const MarketPartnerAttribution = require('../models/MarketPartnerAttribution');
const MarketPartnerLoss = require('../models/MarketPartnerLoss');
const MarketPartnerCustomerHistory = require('../models/MarketPartnerCustomerHistory');
const MarketPartnerLeadEvent = require('../models/MarketPartnerLeadEvent');
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

// 现金经营口径：按付款日期归属订单，成功退款回溯冲减该付款期。
// 在数据库端汇总全部符合条件的订单，不能用页面最近 200 单相加。
router.get('/business-overview', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) || (from && to && from > to))
    return res.status(400).json({ success: false, message: '日期范围无效' });
  try {
    const paidAt = {};
    if (from) paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
    if (to) paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
    if ([...Object.values(paidAt)].some(date => Number.isNaN(date.getTime())))
      return res.status(400).json({ success: false, message: '日期范围无效' });
    const match = { tenantId: tenant(req), paidAmount: { $gt: 0 }, paidAt: Object.keys(paidAt).length ? paidAt : { $type: 'date' },
      paymentStatus: { $in: ['paid', 'refunded'] } };
    const money = value => ({ $round: [{ $multiply: [{ $ifNull: [value, 0] }, 100] }, 0] });
    const [result] = await Order.aggregate([
      { $match: match },
      { $project: { user: 1, marketPartnerId: 1, referrerId: 1, serviceId: 1, serviceName: 1, paymentMethod: 1,
        paidCents: money('$paidAmount'), refundedCents: money('$refundedAmount') } },
      { $addFields: { netCents: { $max: [0, { $subtract: ['$paidCents', '$refundedCents'] }] },
        sourceType: { $cond: [{ $ne: [{ $ifNull: ['$marketPartnerId', null] }, null] }, 'partner',
          { $cond: [{ $ne: [{ $ifNull: ['$referrerId', null] }, null] }, 'staff', 'unassigned'] }] } } },
      { $facet: {
        total: [{ $group: { _id: null, paidCents: { $sum: '$paidCents' }, refundedCents: { $sum: '$refundedCents' },
          netCents: { $sum: '$netCents' }, orderCount: { $sum: 1 } } }],
        sources: [{ $group: { _id: '$sourceType', netCents: { $sum: '$netCents' }, orderCount: { $sum: 1 } } }],
        partners: [{ $match: { sourceType: 'partner' } }, { $group: { _id: '$marketPartnerId', netCents: { $sum: '$netCents' },
          orderCount: { $sum: 1 } } }, { $sort: { netCents: -1 } }],
        staff: [{ $match: { sourceType: 'staff' } }, { $group: { _id: '$referrerId', netCents: { $sum: '$netCents' },
          orderCount: { $sum: 1 } } }, { $sort: { netCents: -1 } }],
        products: [{ $group: { _id: { serviceId: '$serviceId', serviceName: '$serviceName' }, netCents: { $sum: '$netCents' },
          orderCount: { $sum: 1 } } }, { $sort: { netCents: -1 } }],
        channels: [{ $group: { _id: '$paymentMethod', netCents: { $sum: '$netCents' }, orderCount: { $sum: 1 } } }],
      } },
    ]).allowDiskUse(true);
    const [partnerNames, staffNames] = await Promise.all([
      MarketPartner.find({ tenantId: tenant(req), _id: { $in: result.partners.map(row => row._id) } }).select('name').lean(),
      Admin.find({ tenantId: tenant(req), _id: { $in: result.staff.map(row => row._id) } }).select('name').lean(),
    ]);
    const names = new Map([...partnerNames, ...staffNames].map(row => [String(row._id), row.name]));
    const total = result.total[0] || { paidCents: 0, refundedCents: 0, netCents: 0, orderCount: 0 };
    res.json({ success: true, data: { period: { from: from || null, to: to || null, basis: 'payment_date_restated_for_refunds' }, total,
      sources: Object.fromEntries(result.sources.map(row => [row._id, { netCents: row.netCents, orderCount: row.orderCount }])),
      partners: result.partners.map(row => ({ id: row._id, name: names.get(String(row._id)) || '已停用合伙人', netCents: row.netCents, orderCount: row.orderCount })),
      staff: result.staff.map(row => ({ id: row._id, name: names.get(String(row._id)) || '已停用员工', netCents: row.netCents, orderCount: row.orderCount })),
      products: result.products.map(row => ({ serviceId: row._id.serviceId, name: row._id.serviceName || '未命名产品',
        netCents: row.netCents, orderCount: row.orderCount })),
      channels: result.channels.map(row => ({ channel: row._id || '未标注', netCents: row.netCents, orderCount: row.orderCount })),
    } });
  } catch (err) { fail(res, err); }
});

router.get('/business-orders', async (req, res) => {
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  const source = String(req.query.source || '');
  const page = Number(req.query.page || 1), pageSize = Number(req.query.pageSize || 20);
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    || (from && to && from > to) || !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50
    || (source && !['partner', 'staff', 'unassigned'].includes(source)))
    return res.status(400).json({ success: false, message: '筛选或分页条件无效' });
  try {
    const match = { tenantId: tenant(req), paidAmount: { $gt: 0 }, paymentStatus: { $in: ['paid', 'refunded'] },
      paidAt: {} };
    if (from) match.paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
    if (to) match.paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
    if (!Object.keys(match.paidAt).length) match.paidAt = { $type: 'date' };
    if (Object.values(match.paidAt).some(value => Number.isNaN(value.getTime?.())))
      return res.status(400).json({ success: false, message: '日期范围无效' });
    if (source === 'partner') match.marketPartnerId = { $ne: null };
    if (source === 'staff') { match.marketPartnerId = null; match.referrerId = { $ne: null }; }
    if (source === 'unassigned') { match.marketPartnerId = null; match.referrerId = null; }
    const [count, orders] = await Promise.all([
      Order.countDocuments(match),
      Order.find(match).sort({ paidAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize)
        .select('_id orderNo user serviceName specificationLabel paymentMethod paidAmount refundedAmount paidAt marketPartnerId referrerId')
        .populate('user', 'name').populate('marketPartnerId', 'name').populate('referrerId', 'name').lean(),
    ]);
    res.json({ success: true, data: { page, pageSize, count,
      rows: orders.map(order => ({ id: order._id, orderNo: order.orderNo, customer: order.user?.name || '—',
        product: order.serviceName, specification: order.specificationLabel || '', channel: order.paymentMethod || '',
        paidAt: order.paidAt, paidCents: Math.round(Number(order.paidAmount || 0) * 100),
        refundedCents: Math.round(Number(order.refundedAmount || 0) * 100),
        netCents: Math.max(0, Math.round(Number(order.paidAmount || 0) * 100)
          - Math.round(Number(order.refundedAmount || 0) * 100)),
        sourceType: order.marketPartnerId ? 'partner' : order.referrerId ? 'staff' : 'unassigned',
        sourceName: order.marketPartnerId?.name || order.referrerId?.name || '无推广归属',
      })) } });
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

router.patch('/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效合伙人' });
  const name = String(req.body?.name || '').trim().slice(0, 150);
  const phone = String(req.body?.phone || '').trim();
  const productLine = String(req.body?.productLine || '').trim();
  const contractReference = String(req.body?.contractReference || '').trim().slice(0, 150);
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const expected = new Date(req.body?.updatedAt);
  if (!name || !/^1\d{10}$/.test(phone) || !productLine || !reason || !Number.isFinite(expected.getTime()))
    return res.status(400).json({ success: false, message: '请填写合伙人信息、修改原因及当前版本' });
  try {
    const current = await MarketPartner.findOne({ _id: req.params.id, tenantId: tenant(req) }).lean();
    if (!current) return res.status(404).json({ success: false, message: '合伙人不存在' });
    if (current.status === 'closed') return res.status(409).json({ success: false, message: '已关闭合伙人不可修改' });
    if (current.status === 'active' && productLine !== current.productLine)
      return res.status(409).json({ success: false, message: '先暂停合伙人，再修改授权产品线' });
    if (current.status === 'active' && !contractReference)
      return res.status(409).json({ success: false, message: '启用中的合伙人须保留合同编号' });
    const before = { name: current.name, phone: current.phone, productLine: current.productLine,
      contractReference: current.contractReference || '' };
    const after = { name, phone, productLine, contractReference };
    const row = await MarketPartner.findOneAndUpdate({ _id: current._id, tenantId: tenant(req),
      updatedAt: expected, status: current.status }, { $set: after, $push: { changeHistory: {
      at: new Date(), by: req.admin._id, reason, before, after,
    } } }, { new: true, runValidators: true });
    if (!row) return res.status(409).json({ success: false, message: '合伙人资料已变化，请刷新后重试' });
    res.json({ success: true, data: row });
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

router.get('/attributed-orders', async (req, res) => {
  try {
    const rows = await Order.find({ tenantId: tenant(req), marketPartnerId: { $ne: null } })
      .sort({ createdAt: -1 }).limit(200).select('_id user serviceName orderNo marketPartnerId marketPartnerRuleId paymentStatus paidAt')
      .populate('user', 'name phone').populate('marketPartnerId', 'name referralCode').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

// 已付款订单按购买时的服务团队归属快照汇总；退款后的净实收实时重算。
router.get('/team-revenue', async (req, res) => {
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    || (from && to && from > to))
    return res.status(400).json({ success: false, message: '日期范围无效' });
  try {
    const totals = new Map();
    const paidAt = {};
    if (from) paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
    if (to) paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
    if (Object.values(paidAt).some(date => Number.isNaN(date.getTime())))
      return res.status(400).json({ success: false, message: '日期范围无效' });
    const cursor = Order.find({ tenantId: tenant(req), paymentStatus: { $in: ['paid', 'refunded'] },
      paidAmount: { $gt: 0 }, paidAt: Object.keys(paidAt).length ? paidAt : { $type: 'date' },
      'serviceItemsSnapshot.0': { $exists: true } })
      .select('_id serviceId paidAmount refundedAmount serviceItemsSnapshot').lean().cursor();
    for await (const order of cursor) {
      const netCents = Math.max(0, Math.round(Number(order.paidAmount || 0) * 100)
        - Math.round(Number(order.refundedAmount || 0) * 100));
      const allocations = require('../utils/serviceItemIncentiveBasis').allocations(order, netCents);
      if (!allocations) continue;
      allocations.forEach(item => {
        const key = `${order.serviceId}:${item.teamRole}:${item.key}`;
        const row = totals.get(key) || { teamRole: item.teamRole, childProductId: item.childProductId,
          serviceItemKey: item.key, name: item.name, amountCents: 0, orderCount: 0 };
        row.amountCents += item.amountCents;
        row.orderCount += 1;
        totals.set(key, row);
      });
    }
    res.json({ success: true, data: [...totals.values()].sort((a, b) => b.amountCents - a.amountCents) });
  } catch (err) { fail(res, err); }
});

// 同一订单的收款、外部推广与内部服务激励对账视图；只读，不改变各自审核流程。
router.get('/order-accounting/:id', async (req, res) => {
  const key = String(req.params.id || '').trim();
  if (!validId(key) && !/^[A-Za-z0-9-]{6,80}$/.test(key))
    return res.status(400).json({ success: false, message: '请输入有效订单 ID 或订单号' });
  try {
    const order = await Order.findOne({ tenantId: tenant(req), ...(validId(key) ? { _id: key } : { orderNo: key }) })
      .select('_id orderNo user serviceId serviceName specificationLabel servicePrice paymentStatus paidAmount refundedAmount paidAt initiatedByStaff referrerId marketPartnerId servicePerformers serviceItemsSnapshot redemptions status fulfillmentStatus')
      .populate('user', 'name phone').populate('marketPartnerId', 'name referralCode')
      .populate('initiatedByStaff', 'name role').populate('referrerId', 'name role')
      .populate('servicePerformers.staffId', 'name role').lean();
    if (!order) return res.status(404).json({ success: false, message: '本机构订单不存在' });
    const [partnerCommission, staffCommissions, teamIncentives, receipts] = await Promise.all([
      MarketPartnerCommission.find({ tenantId: tenant(req), orderId: order._id }).select('partnerId accruedCents eligibleCashCents paidCents recoveredCents status').lean(),
      Commission.find({ tenantId: tenant(req), orderId: order._id }).select('staffId role commissionAmount status redemptionSequence').populate('staffId', 'name role').lean(),
      TeamIncentive.find({ tenantId: tenant(req), orderId: order._id }).select('staffId role amountCents paidCents recoveredCents status').populate('staffId', 'name role').lean(),
      MarketPartnerReceipt.find({ tenantId: tenant(req), orderId: order._id }).select('amountCents status receivedAt').lean(),
    ]);
    const paidCents = Math.round(Number(order.paidAmount || 0) * 100);
    const refundedCents = Math.round(Number(order.refundedAmount || 0) * 100);
    const netCents = Math.max(0, paidCents - refundedCents);
    const revenueAllocation = (require('../utils/serviceItemIncentiveBasis').allocations(order, netCents) || [])
      .map(item => ({ serviceItemKey: item.key, childProductId: item.childProductId, name: item.name,
        teamRole: item.teamRole, sharePercent: order.serviceItemsSnapshot.find(row => row.key === item.key)?.revenueSharePercent || 0,
        amountCents: item.amountCents }));
    res.json({ success: true, data: { order, cash: { paidCents, refundedCents,
      netCents }, revenueAllocation, partnerCommission,
      staffCommissions, teamIncentives, receipts } });
  } catch (err) { fail(res, err); }
});

router.get('/lead-events', async (req, res) => {
  try {
    const rows = await MarketPartnerLeadEvent.find({ tenantId: tenant(req) }).sort({ occurredAt: -1 })
      .limit(200).populate('partnerId', 'name referralCode').populate('patientId', 'name phone')
      .populate('productId', 'name').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/lead-events', async (req, res) => {
  if (!validId(req.body?.patientId) || !validId(req.body?.productId))
    return res.status(400).json({ success: false, message: '请选择客户和商品' });
  const code = String(req.body.partnerCode || '').trim().toUpperCase();
  const evidence = String(req.body.evidence || '').trim();
  if (!/^[A-F0-9]{12}$/.test(code) || evidence.length < 10 || evidence.length > 1000)
    return res.status(400).json({ success: false, message: '请填写推荐码及具体的首次沟通依据' });
  try {
    const [patient, product, partner] = await Promise.all([
      User.findOne({ _id: req.body.patientId, tenantId: tenant(req), isDeleted: { $ne: true } }).select('_id').lean(),
      Product.findOne({ _id: req.body.productId, tenantId: tenant(req), status: 'on' }).select('_id').lean(),
      MarketPartner.findOne({ tenantId: tenant(req), referralCode: code, status: 'active' }).select('_id productLine').lean(),
    ]);
    if (!patient || !product || !partner)
      return res.status(404).json({ success: false, message: '本机构客户、商品或合伙人不存在' });
    const rule = await require('../utils/marketPartnerAttribution').activeRule(tenant(req), product._id);
    if (!rule || rule.productLine !== partner.productLine)
      return res.status(409).json({ success: false, message: '该合伙人未获此商品授权' });
    const row = await MarketPartnerLeadEvent.create({ tenantId: tenant(req),
      partnerId: partner._id, patientId: patient._id, productId: product._id,
      directReferral: req.body.directReferral === true, evidence, occurredAt: new Date(),
      submittedBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.patch('/lead-events/:id/review', async (req, res) => {
  if (!validId(req.params.id) || !['approved', 'rejected'].includes(req.body?.status))
    return res.status(400).json({ success: false, message: '审核状态无效' });
  try {
    const row = await MarketPartnerLeadEvent.findOne({ _id: req.params.id,
      tenantId: tenant(req), status: 'requested' });
    if (!row) return res.status(404).json({ success: false, message: '待审核沟通事件不存在' });
    if (String(row.submittedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '记录人与审核人须为不同人员' });
    const updated = await MarketPartnerLeadEvent.findOneAndUpdate({ _id: row._id, status: 'requested' },
      { $set: { status: req.body.status, reviewedBy: req.admin._id, reviewedAt: new Date() } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '审核状态已变化' });
    res.json({ success: true, data: updated });
  } catch (err) { fail(res, err); }
});

router.get('/customer-histories', async (req, res) => {
  try {
    const rows = await MarketPartnerCustomerHistory.find({ tenantId: tenant(req) })
      .sort({ createdAt: -1 }).limit(200).populate('patientId', 'name phone').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/customer-histories', async (req, res) => {
  if (!validId(req.body?.orderId)) return res.status(400).json({ success: false, message: '请选择合伙人订单' });
  const priorPaidPeriods = Number(req.body.priorPaidPeriods);
  const evidence = String(req.body.evidence || '').trim();
  if (!Number.isSafeInteger(priorPaidPeriods) || priorPaidPeriods < 0 || priorPaidPeriods > 100
    || evidence.length < 10 || evidence.length > 1000)
    return res.status(400).json({ success: false, message: '请填写历史付费年数及可核对的订单或合同依据' });
  try {
    const order = await Order.findOne({ _id: req.body.orderId, tenantId: tenant(req),
      marketPartnerId: { $ne: null } }).lean();
    const rule = order && await MarketPartnerRule.findOne({ _id: order.marketPartnerRuleId,
      tenantId: tenant(req), kind: 'annual' }).lean();
    if (!rule) return res.status(409).json({ success: false, message: '仅年度合伙人订单需要历史年序核准' });
    const productIds = await MarketPartnerRule.distinct('productId', { tenantId: tenant(req),
      productLine: rule.productLine });
    const first = await Order.findOne({ tenantId: tenant(req), user: order.user,
      serviceId: { $in: productIds.map(String) }, marketPartnerId: { $ne: null } })
      .sort({ createdAt: 1 }).select('createdAt').lean();
    const key = { tenantId: tenant(req), patientId: order.user, productLine: rule.productLine };
    const previous = await MarketPartnerCustomerHistory.findOne(key);
    if (previous && previous.status !== 'rejected')
      return res.status(409).json({ success: false, message: '该客户产品线已有待核或已通过的历史年序' });
    const row = previous ? await MarketPartnerCustomerHistory.findOneAndUpdate({ _id: previous._id,
      status: 'rejected' }, {
      $push: { reviewHistory: { priorPaidPeriods: previous.priorPaidPeriods, evidence: previous.evidence,
        reviewedBy: previous.reviewedBy, reviewedAt: previous.reviewedAt,
        reviewNote: previous.reviewNote } },
      $set: { status: 'requested', cutoverAt: first?.createdAt || order.createdAt,
        priorPaidPeriods, evidence, submittedBy: req.admin._id,
        reviewedBy: null, reviewedAt: null, reviewNote: '' },
    }, { new: true }) : await MarketPartnerCustomerHistory.create({ ...key,
      cutoverAt: first?.createdAt || order.createdAt, priorPaidPeriods, evidence,
      submittedBy: req.admin._id });
    if (!row) return res.status(409).json({ success: false, message: '历史年序状态已变化' });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: '该客户已有历史年序记录' });
    fail(res, err);
  }
});

async function recalculateCustomerHistory(row, tenantId) {
  const productIds = await MarketPartnerRule.distinct('productId', { tenantId,
    productLine: row.productLine });
  const orders = await Order.find({ tenantId, user: row.patientId,
    serviceId: { $in: productIds.map(String) }, marketPartnerId: { $ne: null },
    paymentStatus: { $in: ['paid', 'refunded'] } }).sort({ paidAt: 1 });
  let checked = 0;
  for (const order of orders) {
    await require('../utils/marketPartnerSettlement').syncOrder(order);
    checked += 1;
  }
  return checked;
}

router.patch('/customer-histories/:id/review', async (req, res) => {
  if (!validId(req.params.id) || !['approved', 'rejected'].includes(req.body?.status))
    return res.status(400).json({ success: false, message: '审核状态无效' });
  try {
    const row = await MarketPartnerCustomerHistory.findOne({ _id: req.params.id,
      tenantId: tenant(req), status: 'requested' });
    if (!row) return res.status(404).json({ success: false, message: '待核历史年序不存在' });
    if (String(row.submittedBy) === String(req.admin._id))
      return res.status(403).json({ success: false, message: '提交人与审核人须为不同人员' });
    const updated = await MarketPartnerCustomerHistory.findOneAndUpdate({ _id: row._id,
      status: 'requested' }, { $set: { status: req.body.status, reviewedBy: req.admin._id,
      reviewedAt: new Date(), reviewNote: String(req.body.reviewNote || '').trim().slice(0, 500) } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '审核状态已变化' });
    let warning = '';
    if (updated.status === 'approved') {
      try { await recalculateCustomerHistory(updated, tenant(req)); }
      catch (error) { warning = `历史年序已核准，佣金重算待重试：${error.message}`; }
    }
    res.json({ success: true, data: updated, warning });
  } catch (err) { fail(res, err); }
});

router.post('/customer-histories/:id/recalculate', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效历史年序' });
  try {
    const row = await MarketPartnerCustomerHistory.findOne({ _id: req.params.id,
      tenantId: tenant(req), status: 'approved' });
    if (!row) return res.status(404).json({ success: false, message: '已核准历史年序不存在' });
    const checked = await recalculateCustomerHistory(row, tenant(req));
    res.json({ success: true, data: { checked } });
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
    if (product.stockLimited || product.memberBundle?.enabled)
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
    const contribution = await require('../utils/marketPartnerLeadEvent').contributionAtOrder({
      tenantId: tenant(req), partnerId: match.attribution.partnerId, patientId: patient._id,
      productId: product._id, at: new Date(),
    });
    const serviceItems = sku ? [] : (product.serviceItems || []).filter(item => item.name && Number(item.units) > 0);
    const totalUnits = Math.max(1, Number(sku?.totalUnits) || serviceItems.reduce((sum, item) => sum + Number(item.units || 1), 0) || 1);
    const order = await Order.create({ user: patient._id, payerUser: patient._id,
      beneficiaryName: patient.name || '', tenantId: tenant(req), serviceId: String(product._id),
      serviceName: product.name, servicePrice: listed, unitPrice: Math.round(listed / totalUnits * 100) / 100,
      specificationLabel, skuCode: sku?.code || '', totalUnits,
      orderNo: `MP${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      orderType: 'product', fulfillmentType: sku?.fulfillmentType || product.fulfillmentType,
      tradeStatus: 'awaiting_payment', paymentStatus: 'unpaid', paymentMethod: '',
      paymentExpectedAmount: listed, initiationSource: 'admin',
      serviceItemsSnapshot: serviceItems.map(item => ({ key:item.key, name:item.name, units:item.units,
        usedUnits:0, childProductId:item.childProductId || null, teamRole:item.teamRole || '',
        revenueSharePercent:item.revenueSharePercent || 0, performers:item.performers || [] })),
      performanceRuleSnapshot: product.performanceRule?.toObject?.() || product.performanceRule || null,
      servicePerformerRolesSnapshot: (product.servicePerformerRoles || []).map(row => row.toObject?.() || row),
      staffPerformanceOverridesSnapshot: (product.staffPerformanceOverrides || []).map(row => row.toObject?.() || row),
      serviceWorkflowSnapshot: product.serviceWorkflow?.toObject?.() || product.serviceWorkflow || null,
      serviceProviderSnapshot: { code: product.serviceProvider || 'platform', companyName: '杭州嘉医汇健康管理有限公司' },
      marketPartnerId: match.attribution.partnerId, marketPartnerAttributionId: match.attribution._id,
      marketPartnerRuleId: match.rule._id, marketPartnerRuleVersion: match.rule.version,
      marketPartnerLeadEventId: contribution?.eventId || null,
      marketPartnerDirectEventId: contribution?.directEventId || null,
      marketPartnerDirectReferral: contribution?.directReferral === true,
      marketPartnerFirstConversationAt: contribution?.firstConversationAt || null,
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

router.get('/eligible-packages', async (req, res) => {
  try {
    const rows = await ServicePackage.find({ active: true, 'activation.enabled': true,
      'activation.durationMonths': 12, 'configuration.membershipTier': 'consumer365',
      'configuration.includes365': true }).select('_id name clientBrand activation.price').lean();
    res.json({ success: true, data: rows });
  } catch (err) { fail(res, err); }
});

router.post('/rules', async (req, res) => {
  if (!validId(req.body?.productId)) return res.status(400).json({ success: false, message: '无效商品' });
  try {
    const productLine = String(req.body.productLine || '').trim();
    const sourceType = req.body.sourceType || 'product';
    if (!['product', 'servicePackage'].includes(sourceType)
      || (productLine === 'consumer365') !== (sourceType === 'servicePackage'))
      return res.status(400).json({ success: false, message: '365会员须选择有效年度服务包，其他规则须选择商品' });
    const source = sourceType === 'servicePackage'
      ? await ServicePackage.findOne({ _id: req.body.productId, active: true,
        'activation.enabled': true, 'activation.durationMonths': 12,
        'configuration.membershipTier': 'consumer365', 'configuration.includes365': true }).select('_id').lean()
      : await Product.findOne({ _id: req.body.productId, tenantId: tenant(req) }).select('_id').lean();
    if (!source) return res.status(404).json({ success: false, message: '商品或365会员服务包不存在' });
    const latest = await MarketPartnerRule.findOne({ tenantId: tenant(req), productId: source._id }).sort({ version: -1 }).select('version').lean();
    const row = await MarketPartnerRule.create({ tenantId: tenant(req), productId: source._id,
      sourceType, productLine, version: (latest?.version || 0) + 1,
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

// 仅草稿可原位修改；已发布版本只能复制成新版本，历史订单继续引用旧版。
router.patch('/rules/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  const expected = new Date(req.body?.updatedAt);
  const start = new Date(req.body?.effectiveFrom);
  const end = req.body?.effectiveUntil ? new Date(req.body.effectiveUntil) : null;
  const rates = [req.body?.firstBasisPoints, ...(req.body?.tierBasisPoints || []),
    ...(req.body?.renewalBasisPoints || []).map(item => item.basisPoints)];
  const years = (req.body?.renewalBasisPoints || []).map(item => item.year);
  if (!Number.isFinite(expected.getTime()) || !Number.isFinite(start.getTime())
    || (end && (!Number.isFinite(end.getTime()) || end <= start))
    || !rates.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 10000)
    || !years.every(value => Number.isSafeInteger(value) && value >= 2 && value <= 20)
    || new Set(years).size !== years.length
    || !['annual', 'first', 'every'].includes(req.body?.kind))
    return res.status(400).json({ success: false, message: '规则草稿内容或版本时间无效' });
  try {
    const fields = { kind: req.body.kind, firstBasisPoints: req.body.firstBasisPoints,
      tierBasisPoints: req.body.tierBasisPoints || [], renewalBasisPoints: req.body.renewalBasisPoints || [],
      directReferralRequired: req.body.directReferralRequired === true,
      quickCloseEnabled: req.body.quickCloseEnabled === true,
      quickCloseCapCents: req.body.quickCloseCapCents ?? 100000,
      retentionFloorBasisPoints: req.body.retentionFloorBasisPoints ?? null,
      effectiveFrom: start, effectiveUntil: end };
    const row = await MarketPartnerRule.findOneAndUpdate({ _id: req.params.id, tenantId: tenant(req),
      status: 'draft', updatedAt: expected }, { $set: fields }, { new: true, runValidators: true });
    if (!row) return res.status(409).json({ success: false, message: '草稿已变化或已发布，请刷新后重试' });
    res.json({ success: true, data: row });
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
    const product = await Product.findOne({ _id: req.body.productId, tenantId: tenant(req) }).select('_id serviceItems').lean();
    if (!product) return res.status(404).json({ success: false, message: '商品不存在' });
    if ((product.serviceItems || []).length && (product.serviceItems || []).every(item => item.childProductId))
      return res.status(409).json({ success: false, message: '已关联子产品的专项激励须按子产品规则计算' });
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

router.patch('/team-rules/:id', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效团队规则' });
  const expected = new Date(req.body?.updatedAt);
  const start = new Date(req.body?.effectiveFrom);
  const end = req.body?.effectiveUntil ? new Date(req.body.effectiveUntil) : null;
  if (!Number.isFinite(expected.getTime()) || !Number.isFinite(start.getTime())
    || (end && (!Number.isFinite(end.getTime()) || end <= start))
    || !['percentage', 'fixedAmount'].includes(req.body?.ruleType)
    || !Number.isSafeInteger(req.body?.basisPoints) || req.body.basisPoints < 0 || req.body.basisPoints > 10000
    || !Number.isSafeInteger(req.body?.amountCents) || req.body.amountCents < 0)
    return res.status(400).json({ success: false, message: '团队规则草稿内容或版本时间无效' });
  try {
    const row = await TeamIncentiveRule.findOneAndUpdate({ _id: req.params.id, tenantId: tenant(req),
      status: 'draft', updatedAt: expected }, { $set: {
      ruleType: req.body.ruleType, basisPoints: req.body.basisPoints, amountCents: req.body.amountCents,
      capCents: req.body.capCents ?? null, effectiveFrom: start, effectiveUntil: end,
    } }, { new: true, runValidators: true });
    if (!row) return res.status(409).json({ success: false, message: '草稿已变化或已发布，请刷新后重试' });
    res.json({ success: true, data: row });
  } catch (err) { fail(res, err); }
});

router.patch('/team-rules/:id/publish', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ success: false, message: '无效规则' });
  try {
    const row = await TeamIncentiveRule.findOne({ _id: req.params.id, tenantId: tenant(req), status: 'draft' });
    if (!row) return res.status(404).json({ success: false, message: '草稿规则不存在' });
    const product = await Product.findOne({ _id: row.productId, tenantId: tenant(req) }).select('serviceItems').lean();
    if ((product?.serviceItems || []).length && (product.serviceItems || []).every(item => item.childProductId))
      return res.status(409).json({ success: false, message: '已关联子产品的专项激励须按子产品规则计算' });
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
    const composite = (order.serviceItemsSnapshot || []).some(item => Number(item.revenueSharePercent) > 0);
    const serviceItemKey = composite ? String(req.body?.serviceItemKey || '').trim() : '';
    const item = composite ? (order.serviceItemsSnapshot || []).find(entry => entry.key === serviceItemKey) : null;
    if (composite && (!item || item.teamRole !== role || !validId(req.body?.serviceEvidenceId)))
      return res.status(409).json({ success: false, message: '请选择该岗位已核销的组合子项和核销记录' });
    const productId = composite ? item.childProductId || order.serviceId : order.serviceId;
    const product = await Product.findOne({ _id: productId, tenantId: tenant(req) }).select('_id').lean();
    const evidence = composite
      ? (order.redemptions || []).find(entry => String(entry._id) === String(req.body.serviceEvidenceId)
        && entry.serviceItemKey === serviceItemKey)
      : await Fulfillment.findOne({ order: order._id, status: 'completed', completedAt: { $ne: null } });
    const staff = await Admin.findOne({ _id: req.body.staffId, tenantId: tenant(req), role }).select('_id').lean();
    if (!product || !evidence || !staff)
      return res.status(409).json({ success: false, message: '商品、已完成履约记录或服务人员岗位未核实' });
    if (await Commission.exists({ orderId: order._id, staffId: staff._id, role: 'fulfiller',
      status: { $ne: 'cancelled' } }))
      return res.status(409).json({ success: false, message: '该人员已有本单现行服务绩效，不可重复计提' });
    const verified = await require('../utils/marketPartnerSettlement').verifiedCashCents(order);
    if (verified === null) return res.status(409).json({ success: false, message: '现金收款尚未核实' });
    const netCents = Math.max(0, verified - await require('../utils/marketPartnerSettlement').refundedCashCents(order._id));
    const allocation = composite ? require('../utils/serviceItemIncentiveBasis')
      .unitBasis(order, netCents, serviceItemKey, evidence._id) : null;
    if (composite && !allocation)
      return res.status(409).json({ success: false, message: '组合拆解或核销次数无法核对' });
    const basisCents = composite ? allocation.basisCents : netCents;
    const at = order.paidAt;
    const rule = await TeamIncentiveRule.findOne({ tenantId: tenant(req), productId: product._id,
      specificationLabel: composite ? '' : order.specificationLabel || '', role, trigger: 'service_completed', status: 'active',
      effectiveFrom: { $lte: at }, $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] })
      .sort({ version: -1 }).lean();
    if (!rule) return res.status(409).json({ success: false, message: '付款时无适用的团队激励规则' });
    const amountCents = teamIncentiveCents({ role, ruleType: rule.ruleType, basisCents,
      basisPoints: rule.basisPoints, amountCents: rule.amountCents, capCents: rule.capCents });
    if (await TeamIncentive.exists({ tenantId: tenant(req), orderId: order._id, role,
      trigger: rule.trigger, serviceEvidenceId: evidence._id }))
      return res.status(409).json({ success: false, message: '该子项核销或履约证据已归属其他人员，请走纠错审核' });
    const row = await TeamIncentive.create({ tenantId: tenant(req), orderId: order._id,
      staffId: staff._id, role, trigger: rule.trigger, serviceEvidenceId: evidence._id, serviceItemKey,
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
    const evidence = row.serviceItemKey
      ? await Order.findOne({ _id: row.orderId, tenantId: tenant(req),
        redemptions: { $elemMatch: { _id: row.serviceEvidenceId, serviceItemKey: row.serviceItemKey } } }).select('_id').lean()
      : await Fulfillment.findOne({ _id: row.serviceEvidenceId, order: row.orderId, status: 'completed' });
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
    const originalRule = await MarketPartnerRule.findOne({ _id: before.ruleId,
      tenantId: tenant(req), version: before.ruleVersion }).lean();
    if (!originalRule || (order.marketPartnerContractReference && before.periodNumber > 1
      && ['annualAdvisor', 'premiumAdvisor'].includes(originalRule.productLine)
      && !await require('../utils/marketPartnerSettlement').annualContractPeriod(order, originalRule, before.periodNumber)))
      return res.status(409).json({ success: false, message: '年度续费合同尚未对应已确认的服务期' });
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
