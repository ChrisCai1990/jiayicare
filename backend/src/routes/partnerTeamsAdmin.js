const router = require('express').Router();
const mongoose = require('mongoose');
const adminAuth = require('../middleware/adminAuth');
const Admin = require('../models/Admin');
const MarketPartner = require('../models/MarketPartner');
const PartnerTeam = require('../models/PartnerTeam');
const PartnerTeamRelation = require('../models/PartnerTeamRelation');
const PartnerTeamRule = require('../models/PartnerTeamRule');
const PartnerTeamEarning = require('../models/PartnerTeamEarning');
const Order = require('../models/Order');
const { deliveredServiceShares } = require('../utils/partnerTeamEarning');

router.use(adminAuth);
router.use((req, res, next) => req.admin.role === 'superadmin' && req.admin.tenantId
  ? next() : res.status(403).json({ success: false, message: '仅机构超级管理员可管理团队核算' }));
const bad = (res, message, code = 400) => res.status(code).json({ success: false, message });
const valid = mongoose.isValidObjectId;
const identity = async (tenantId, type, id) => type === 'staff'
  ? Admin.findOne({ tenantId, _id: id, staffStatus: 'active' }).select('_id name role').lean()
  : MarketPartner.findOne({ tenantId, _id: id, status: 'active' }).select('_id name referralCode').lean();

router.get('/teams', async (req, res) => {
  const tenantId = req.admin.tenantId;
  const teams = await PartnerTeam.find({ tenantId, effectiveUntil: null }).sort({ createdAt: -1 }).lean();
  const [staff, partners, counts] = await Promise.all([
    Admin.find({ tenantId, _id: { $in: teams.filter(row => row.leaderType === 'staff').map(row => row.leaderId) } }).select('_id name').lean(),
    MarketPartner.find({ tenantId, _id: { $in: teams.filter(row => row.leaderType === 'partner').map(row => row.leaderId) } }).select('_id name').lean(),
    PartnerTeamRelation.aggregate([{ $match: { tenantId: new mongoose.Types.ObjectId(String(tenantId)), effectiveUntil: null } },
      { $group: { _id: { leaderType: '$leaderType', leaderId: '$leaderId' }, count: { $sum: 1 } } }]),
  ]);
  const names = new Map([...staff.map(row => [`staff:${row._id}`, row.name]),
    ...partners.map(row => [`partner:${row._id}`, row.name])]);
  const members = new Map(counts.map(row => [`${row._id.leaderType}:${row._id.leaderId}`, row.count]));
  res.json({ success: true, data: teams.map(row => ({ ...row,
    leaderName: names.get(`${row.leaderType}:${row.leaderId}`) || '已停用人员',
    memberCount: members.get(`${row.leaderType}:${row.leaderId}`) || 0,
  })) });
});

router.post('/teams', async (req, res) => {
  const { leaderType, leaderId } = req.body || {};
  if (!['staff', 'partner'].includes(leaderType) || !valid(leaderId)) return bad(res, '请选择负责人');
  const tenantId = req.admin.tenantId;
  if (!await identity(tenantId, leaderType, leaderId)) return bad(res, '负责人未启用，或不属于本机构', 404);
  if (await PartnerTeamRelation.exists({ tenantId, memberType: leaderType, memberId: leaderId, effectiveUntil: null }))
    return bad(res, '该人员已归属其他团队，请先结束成员关系', 409);
  try {
    const team = await PartnerTeam.create({ tenantId, leaderType, leaderId,
      effectiveFrom: new Date(), createdBy: req.admin._id });
    res.status(201).json({ success: true, data: team });
  } catch (error) {
    if (error.code === 11000) return bad(res, '该负责人已有团队', 409);
    return bad(res, '创建团队失败', 500);
  }
});

router.post('/teams/:id/end', async (req, res) => {
  if (!valid(req.params.id)) return bad(res, '团队不存在');
  const team = await PartnerTeam.findOne({ _id: req.params.id, tenantId: req.admin.tenantId, effectiveUntil: null });
  if (!team) return bad(res, '团队不存在', 404);
  if (await PartnerTeamRelation.exists({ tenantId: req.admin.tenantId,
    leaderType: team.leaderType, leaderId: team.leaderId, effectiveUntil: null }))
    return bad(res, '请先结束团队内所有成员关系', 409);
  team.effectiveUntil = new Date(); team.endedBy = req.admin._id;
  await team.save();
  res.json({ success: true, data: team });
});

router.get('/relations', async (req, res) => {
  const tenantId = req.admin.tenantId;
  const rows = await PartnerTeamRelation.find({ tenantId,
    ...(req.query.history === 'true' ? {} : { effectiveUntil: null }) })
    .sort({ createdAt: -1 }).limit(1000).lean();
  const [staff, partners, rules] = await Promise.all([
    Admin.find({ tenantId, _id: { $in: rows.flatMap(row => [row.leaderId, row.memberId]) } })
      .select('_id name').lean(),
    MarketPartner.find({ tenantId, _id: { $in: rows.flatMap(row => [row.leaderId, row.memberId]) } })
      .select('_id name referralCode status').lean(),
    PartnerTeamRule.find({ tenantId, relationId: { $in: rows.map(row => row._id) },
      effectiveUntil: null }).lean(),
  ]);
  const staffNames = new Map(staff.map(row => [String(row._id), row.name]));
  const partnerNames = new Map(partners.map(row => [String(row._id), row.name]));
  res.json({ success: true, data: rows.map(row => ({ ...row,
    leaderName: (row.leaderType === 'staff' ? staffNames : partnerNames).get(String(row.leaderId)) || '已停用人员',
    memberName: (row.memberType === 'staff' ? staffNames : partnerNames).get(String(row.memberId)) || '已停用人员',
    rules: rules.filter(rule => String(rule.relationId) === String(row._id)),
  })) });
});

router.post('/relations', async (req, res) => {
  const { leaderType, leaderId, memberType, memberId } = req.body || {};
  if (!['staff', 'partner'].includes(leaderType) || !['staff', 'partner'].includes(memberType)
    || !valid(leaderId) || !valid(memberId) || (leaderType === memberType && String(leaderId) === String(memberId)))
    return bad(res, '请选择不同的团队负责人和成员');
  const tenantId = req.admin.tenantId;
  const [leader, member] = await Promise.all([identity(tenantId, leaderType, leaderId),
    identity(tenantId, memberType, memberId)]);
  if (!leader || !member) return bad(res, '负责人或成员未启用，或不属于本机构', 404);
  const team = await PartnerTeam.findOne({ tenantId, leaderType, leaderId, effectiveUntil: null });
  if (!team) return bad(res, '请先新增该负责人的团队', 409);
  if (await PartnerTeam.exists({ tenantId, leaderType: memberType, leaderId: memberId, effectiveUntil: null }))
    return bad(res, '该人员已是独立负责人，不能加入其他团队', 409);
  try {
    const row = await PartnerTeamRelation.create({ tenantId, leaderType, leaderId,
      memberType, memberId, effectiveFrom: new Date(), createdBy: req.admin._id });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    if (error.code === 11000) return bad(res, '该成员已有生效团队，请先结束原关系', 409);
    return bad(res, '创建团队关系失败', 500);
  }
});

router.post('/relations/:id/end', async (req, res) => {
  if (!valid(req.params.id) || !String(req.body?.reason || '').trim()) return bad(res, '请填写结束原因');
  const now = new Date();
  const row = await PartnerTeamRelation.findOneAndUpdate({ _id: req.params.id,
    tenantId: req.admin.tenantId, effectiveUntil: null }, { $set: {
    effectiveUntil: now, endedBy: req.admin._id, endReason: String(req.body.reason).trim().slice(0, 500),
  } }, { new: true });
  if (!row) return bad(res, '团队关系已结束或不存在', 404);
  await PartnerTeamRule.updateMany({ tenantId: req.admin.tenantId, relationId: row._id,
    effectiveUntil: null }, { $set: { effectiveUntil: now } });
  res.json({ success: true, data: row });
});

router.post('/relations/:id/rules', async (req, res) => {
  const { activity, calculationType } = req.body || {};
  const value = Number(req.body?.value);
  if (!valid(req.params.id) || !['promotion', 'service'].includes(activity)
    || !['percentage', 'fixedAmount'].includes(calculationType) || !Number.isFinite(value)
    || value < 0 || (calculationType === 'percentage' && value > 100)
    || (calculationType === 'fixedAmount' && value > 1000000))
    return bad(res, '请选择推广或服务，并填写有效的比例或金额');
  const relation = await PartnerTeamRelation.findOne({ _id: req.params.id,
    tenantId: req.admin.tenantId, effectiveUntil: null }).lean();
  if (!relation) return bad(res, '请先建立生效的团队关系', 404);
  if (activity === 'service' && relation.memberType !== 'staff')
    return bad(res, '市场成员没有员工服务费来源');
  const previous = await PartnerTeamRule.findOne({ tenantId: req.admin.tenantId,
    relationId: relation._id, activity }).sort({ version: -1 }).lean();
  const now = new Date();
  const row = await PartnerTeamRule.create({ tenantId: req.admin.tenantId,
    relationId: relation._id, activity, calculationType,
    basisPoints: calculationType === 'percentage' ? Math.round(value * 100) : 0,
    amountCents: calculationType === 'fixedAmount' ? Math.round(value * 100) : 0,
    version: (previous?.version || 0) + 1, effectiveFrom: now, createdBy: req.admin._id });
  await PartnerTeamRule.updateMany({ tenantId: req.admin.tenantId,
    relationId: relation._id, activity, _id: { $ne: row._id }, effectiveUntil: null },
  { $set: { effectiveUntil: now } });
  res.status(201).json({ success: true, data: row });
});

router.get('/earnings', async (req, res) => {
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const pageSize = 10;
  const query = { tenantId: req.admin.tenantId };
  if (req.query.leaderType && req.query.leaderId) {
    if (!['staff', 'partner'].includes(req.query.leaderType) || !valid(req.query.leaderId))
      return bad(res, '无效负责人');
    query.leaderType = req.query.leaderType; query.leaderId = req.query.leaderId;
  }
  const [count, rows] = await Promise.all([
    PartnerTeamEarning.countDocuments(query),
    PartnerTeamEarning.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize)
      .limit(pageSize).populate('orderId', 'orderNo serviceName paidAt').lean(),
  ]);
  res.json({ success: true, data: { count, page, pageSize, rows } });
});

router.get('/summary', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    || (from && to && from > to)) return bad(res, '日期范围无效');
  const paidAt = {};
  if (from) paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
  if (to) paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
  const rows = await PartnerTeamEarning.aggregate([
    { $match: { tenantId: req.admin.tenantId } },
    ...(from || to ? [{ $lookup: { from: Order.collection.name, localField: 'orderId',
      foreignField: '_id', as: 'sourceOrder' } }, { $unwind: '$sourceOrder' },
    { $match: { 'sourceOrder.paidAt': paidAt,
      'sourceOrder.tenantId': req.admin.tenantId } }] : []),
    { $group: { _id: { leaderType: '$leaderType', leaderId: '$leaderId', activity: '$activity' },
      basisCents: { $sum: '$basisCents' }, accruedCents: { $sum: '$accruedCents' },
      paidCents: { $sum: '$paidCents' }, recoveredCents: { $sum: '$recoveredCents' },
      count: { $sum: 1 } } },
    { $sort: { accruedCents: -1 } },
  ]);
  const [staff, partners] = await Promise.all([
    Admin.find({ tenantId: req.admin.tenantId, _id: { $in: rows.filter(row => row._id.leaderType === 'staff')
      .map(row => row._id.leaderId) } }).select('_id name').lean(),
    MarketPartner.find({ tenantId: req.admin.tenantId, _id: { $in: rows.filter(row => row._id.leaderType === 'partner')
      .map(row => row._id.leaderId) } }).select('_id name').lean(),
  ]);
  const names = new Map([...staff, ...partners].map(row => [String(row._id), row.name]));
  res.json({ success: true, data: rows.map(row => ({ ...row._id,
    leaderName: names.get(String(row._id.leaderId)) || '已停用人员',
    basisCents: row.basisCents, accruedCents: row.accruedCents,
    paidCents: row.paidCents, recoveredCents: row.recoveredCents, count: row.count })) });
});

// Team KPIs are a second view of the same cash; they never add to company revenue.
// Service KPI comes from the frozen product allocation and actual named performer,
// whether or not that employee has a service commission rule.
router.get('/business-volume', async (req, res) => {
  const tenantId = req.admin.tenantId;
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    || (from && to && from > to)) return bad(res, '日期范围无效');
  const relations = await PartnerTeamRelation.find({ tenantId }).lean();
  if (!relations.length) return res.json({ success: true, data: [] });
  const byMember = new Map();
  for (const relation of relations) {
    const key = `${relation.memberType}:${relation.memberId}`;
    if (!byMember.has(key)) byMember.set(key, []);
    byMember.get(key).push(relation);
  }
  const atRelation = (type, id, at) => (byMember.get(`${type}:${id}`) || []).find(row =>
    at >= row.effectiveFrom && (!row.effectiveUntil || at < row.effectiveUntil));
  const paidAt = { $type: 'date' };
  if (from || to) {
    if (from) paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
    if (to) paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
  }
  const totals = new Map();
  const add = (relation, activity, amountCents) => {
    if (!relation || amountCents <= 0) return;
    const key = `${relation._id}:${activity}`;
    const current = totals.get(key) || { leaderType: relation.leaderType, leaderId: relation.leaderId,
      memberType: relation.memberType, memberId: relation.memberId, activity,
      amountCents: 0, orderCount: 0 };
    current.amountCents += amountCents;
    current.orderCount += 1;
    totals.set(key, current);
  };
  const staffIds = relations.filter(row => row.memberType === 'staff').map(row => row.memberId);
  const partnerIds = relations.filter(row => row.memberType === 'partner').map(row => row.memberId);
  const sources = [
    ...(partnerIds.length ? [{ marketPartnerId: { $in: partnerIds } }] : []),
    ...(staffIds.length ? [{ referrerId: { $in: staffIds } },
      { 'servicePerformers.staffId': { $in: staffIds } }, { fulfillerId: { $in: staffIds } }] : []),
  ];
  const cursor = Order.find({ tenantId, paidAt, paidAmount: { $gt: 0 },
    paymentStatus: { $in: ['paid', 'refunded'] }, $or: sources })
    .select('status tradeStatus paidAt paidAmount refundedAmount paymentStatus refundStatus marketPartnerId referrerId verifiedAt completedAt redemptions servicePerformers fulfillerId businessAllocationsSnapshot serviceItemsSnapshot')
    .lean().cursor();
  for await (const order of cursor) {
    if (require('../utils/commissionLifecycle').cancellationReason(order)) continue;
    const netCents = Math.max(0, Math.round((Number(order.paidAmount || 0) - Number(order.refundedAmount || 0)) * 100));
    if (!netCents) continue;
    if (order.marketPartnerId) add(atRelation('partner', order.marketPartnerId, order.paidAt), 'promotion', netCents);
    else if (order.referrerId) add(atRelation('staff', order.referrerId, order.paidAt), 'promotion', netCents);
    for (const share of deliveredServiceShares(order)) add(atRelation('staff', share.staffId,
      share.evidenceAt), 'service', share.basisCents);
  }
  const rows = [...totals.values()].sort((a, b) => b.amountCents - a.amountCents);
  res.json({ success: true, data: rows });
});

router.get('/people-volume', async (req, res) => {
  const from = String(req.query.from || '');
  const to = String(req.query.to || '');
  if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))
    || (from && to && from > to)) return bad(res, '日期范围无效');
  const paidAt = { $type: 'date' };
  if (from) paidAt.$gte = new Date(`${from}T00:00:00+08:00`);
  if (to) paidAt.$lt = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000);
  const totals = new Map();
  const add = (personType, personId, activity, orderId, amountCents) => {
    if (!personId || amountCents <= 0) return;
    const key = `${personType}:${personId}:${activity}`;
    const current = totals.get(key) || { personType, personId,
      activity, amountCents: 0, orderIds: new Set() };
    current.amountCents += amountCents;
    current.orderIds.add(String(orderId));
    totals.set(key, current);
  };
  const cursor = Order.find({ tenantId: req.admin.tenantId, paidAt,
    paidAmount: { $gt: 0 }, paymentStatus: { $in: ['paid', 'refunded'] } })
    .select('_id status tradeStatus paidAt paidAmount refundedAmount paymentStatus refundStatus marketPartnerId referrerId verifiedAt completedAt redemptions totalUnits servicePerformers fulfillerId businessAllocationsSnapshot serviceItemsSnapshot')
    .lean().cursor();
  for await (const order of cursor) {
    if (require('../utils/commissionLifecycle').cancellationReason(order)) continue;
    const netCents = Math.max(0, Math.round((Number(order.paidAmount || 0)
      - Number(order.refundedAmount || 0)) * 100));
    if (!netCents) continue;
    if (order.marketPartnerId) add('partner', order.marketPartnerId, 'promotion', order._id, netCents);
    else add('staff', order.referrerId, 'promotion', order._id, netCents);
    for (const item of deliveredServiceShares(order))
      add('staff', item.staffId, 'service', order._id, item.basisCents);
  }
  const rows = [...totals.values()].sort((a, b) => b.amountCents - a.amountCents);
  const [staff, partners] = await Promise.all([
    Admin.find({ tenantId: req.admin.tenantId, _id: { $in: rows.filter(row => row.personType === 'staff')
      .map(row => row.personId) } }).select('_id name').lean(),
    MarketPartner.find({ tenantId: req.admin.tenantId, _id: { $in: rows.filter(row => row.personType === 'partner')
      .map(row => row.personId) } }).select('_id name').lean(),
  ]);
  const names = new Map([...staff, ...partners].map(item => [String(item._id), item.name]));
  res.json({ success: true, data: rows.map(item => ({ personType: item.personType,
    personId: item.personId, personName: names.get(String(item.personId)) || '已停用人员',
    activity: item.activity, amountCents: item.amountCents,
    orderCount: item.orderIds.size })) });
});

router.post('/earnings/:id/payment', async (req, res) => {
  const amountCents = Math.round(Number(req.body?.amount) * 100);
  const reference = String(req.body?.reference || '').trim().slice(0, 150);
  if (!valid(req.params.id) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !reference)
    return bad(res, '请填写已转账金额和凭据流水号');
  const tenantId = req.admin.tenantId;
  if (await PartnerTeamEarning.exists({ tenantId, paymentReferences: reference }))
    return bad(res, '该流水号已登记', 409);
  const row = await PartnerTeamEarning.findOne({ _id: req.params.id, tenantId,
    status: 'pending', accruedCents: { $gte: amountCents } });
  if (!row || row.accruedCents - row.paidCents + row.recoveredCents < amountCents
    || !row.eligibleAt || row.eligibleAt > new Date())
    return bad(res, '未到结算期、金额超出应付或记录不存在', 409);
  const updated = await PartnerTeamEarning.findOneAndUpdate({ _id: row._id, tenantId,
    updatedAt: row.updatedAt, status: 'pending' }, { $inc: { paidCents: amountCents },
    $addToSet: { paymentReferences: reference }, $push: { ledger: {
      kind: 'payment', amountCents, at: new Date(), actorId: req.admin._id, reference,
    } } }, { new: true });
  if (!updated) return bad(res, '记录已变化，请刷新后重试', 409);
  updated.status = updated.paidCents - updated.recoveredCents === updated.accruedCents ? 'paid' : 'pending';
  await updated.save();
  res.json({ success: true, data: updated });
});

router.post('/earnings/:id/recovery', async (req, res) => {
  const amountCents = Math.round(Number(req.body?.amount) * 100);
  const reference = String(req.body?.reference || '').trim().slice(0, 150);
  if (!valid(req.params.id) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || !reference)
    return bad(res, '请填写实际追回金额和凭据流水号');
  const tenantId = req.admin.tenantId;
  if (await PartnerTeamEarning.exists({ tenantId, recoveryReferences: reference }))
    return bad(res, '该追回流水号已登记', 409);
  const row = await PartnerTeamEarning.findOne({ _id: req.params.id, tenantId, status: 'reversal_due' });
  if (!row || row.paidCents - row.recoveredCents - row.accruedCents < amountCents)
    return bad(res, '追回金额超过待追回额或记录不存在', 409);
  const updated = await PartnerTeamEarning.findOneAndUpdate({ _id: row._id, tenantId,
    updatedAt: row.updatedAt, status: 'reversal_due' }, { $inc: { recoveredCents: amountCents },
    $addToSet: { recoveryReferences: reference }, $push: { ledger: {
      kind: 'recovery', amountCents, at: new Date(), actorId: req.admin._id, reference,
    } } }, { new: true });
  if (!updated) return bad(res, '记录已变化，请刷新后重试', 409);
  const outstanding = updated.paidCents - updated.recoveredCents;
  updated.status = outstanding > updated.accruedCents ? 'reversal_due'
    : outstanding === updated.accruedCents ? 'paid'
      : updated.accruedCents ? 'pending' : 'cancelled';
  await updated.save();
  res.json({ success: true, data: updated });
});

module.exports = router;
