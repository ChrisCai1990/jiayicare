const Order = require('../models/Order');
const Refund = require('../models/Refund');
const PartnerTeamRelation = require('../models/PartnerTeamRelation');
const PartnerTeamRule = require('../models/PartnerTeamRule');
const PartnerTeamEarning = require('../models/PartnerTeamEarning');
const { allocations } = require('./businessRevenueAllocation');

const cents = value => Math.round(Number(value || 0) * 100);
const activeAt = at => ({ effectiveFrom: { $lte: at },
  $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] });

function amountFor(rule, basisCents, originalBasisCents) {
  if (basisCents <= 0) return 0;
  if (rule.calculationType === 'percentage') return Math.round(basisCents * rule.basisPoints / 10000);
  return originalBasisCents > 0
    ? Math.round(rule.amountCents * Math.min(1, basisCents / originalBasisCents)) : 0;
}

function statusFor(sourceStatus, accruedCents, paidCents, recoveredCents) {
  if (paidCents - recoveredCents > accruedCents) return 'reversal_due';
  if (accruedCents === 0) return 'cancelled';
  if (paidCents - recoveredCents === accruedCents) return 'paid';
  return sourceStatus === 'estimated' ? 'estimated' : 'pending';
}

async function syncSource(sourceType, source) {
  if (!source?._id || !source.orderId || !source.tenantId) return null;
  if (sourceType === 'staffCommission' && source.role !== 'referrer') return null;
  const order = await Order.findOne({ _id: source.orderId, tenantId: source.tenantId })
    .select('_id tenantId paidAt paidAmount marketPartnerId status paymentStatus refundStatus tradeStatus').lean();
  if (!order) return null;
  if (sourceType === 'staffCommission' && order.marketPartnerId) return null;
  const memberType = sourceType === 'staffCommission' ? 'staff' : 'partner';
  const memberId = sourceType === 'staffCommission' ? source.staffId : source.partnerId;
  const activity = 'promotion';
  const at = order.paidAt;
  if (!at) return null;
  const existing = await PartnerTeamEarning.findOne({ tenantId: source.tenantId, sourceType,
    sourceId: source._id, sourceKey: '' });
  let relation, rule;
  if (existing) {
    rule = { calculationType: existing.calculationType, basisPoints: existing.basisPoints,
      amountCents: existing.fixedCents };
  } else {
    relation = await PartnerTeamRelation.findOne({ tenantId: source.tenantId, memberType, memberId,
      ...activeAt(at) }).lean();
    if (!relation) return null;
    rule = await PartnerTeamRule.findOne({ tenantId: source.tenantId, relationId: relation._id,
      activity, ...activeAt(at) }).sort({ version: -1 }).lean();
    if (!rule) return null;
  }
  const refundRows = sourceType === 'staffCommission' ? await Refund.find({ order: order._id,
    status: 'succeeded' }).select('amount').lean() : [];
  const refundedCents = refundRows.reduce((sum, row) => sum + cents(row.amount), 0);
  const originalBasisCents = sourceType === 'staffCommission'
    ? cents(source.originalOrderAmount ?? source.orderAmount) : cents(order.paidAmount);
  const basisCents = sourceType === 'staffCommission'
    ? Math.max(0, Math.round(originalBasisCents * Math.max(0,
      1 - refundedCents / Math.max(1, cents(order.paidAmount)))))
    : Math.max(0, source.eligibleCashCents || 0);
  const currentBasis = source.status === 'cancelled'
    || require('./commissionLifecycle').cancellationReason(order) ? 0 : basisCents;
  const accruedCents = amountFor(rule, currentBasis, originalBasisCents);
  if (!existing) {
    try {
      return await PartnerTeamEarning.create({ tenantId: source.tenantId, orderId: order._id,
        sourceType, sourceId: source._id, sourceKey: '', relationId: relation._id, ruleId: rule._id,
        ruleVersion: rule.version, leaderType: relation.leaderType, leaderId: relation.leaderId,
        memberType, memberId, activity, calculationType: rule.calculationType,
        basisPoints: rule.basisPoints, fixedCents: rule.amountCents,
        basisCents: currentBasis, accruedCents,
        status: statusFor(source.status, accruedCents, 0, 0),
        eligibleAt: source.firstEligibleAt || source.eligibleAt
          ? new Date(Math.max(new Date(source.firstEligibleAt || source.eligibleAt).getTime(),
            new Date(order.paidAt).getTime() + 30 * 86400000)) : null,
        ledger: [{ kind: 'accrual', amountCents: accruedCents, at: new Date() }] });
    } catch (error) {
      if (error.code !== 11000) throw error;
      return syncSource(sourceType, source);
    }
  }
  const nextStatus = statusFor(source.status, accruedCents, existing.paidCents, existing.recoveredCents);
  if (existing.basisCents === currentBasis && existing.accruedCents === accruedCents
    && existing.status === nextStatus) return existing;
  return PartnerTeamEarning.findOneAndUpdate({ _id: existing._id, updatedAt: existing.updatedAt }, {
    $set: { basisCents: currentBasis, accruedCents, status: nextStatus,
      eligibleAt: source.firstEligibleAt || source.eligibleAt
        ? new Date(Math.max(new Date(source.firstEligibleAt || source.eligibleAt).getTime(),
          new Date(order.paidAt).getTime() + 30 * 86400000)) : null },
    ...(existing.accruedCents !== accruedCents ? { $push: { ledger: { kind: 'recalculation',
      amountCents: accruedCents - existing.accruedCents, at: new Date() } } } : {}),
  }, { new: true });
}

// Service leader earnings follow completed service allocations, independently of
// whether the employee has a personal service fee/Commission row.
function deliveredServiceShares(order) {
  if (!['paid', 'refunded'].includes(order.paymentStatus)) return [];
  const evidenceAt = (order.redemptions || [])
    .map(item => item.redeemedAt).filter(Boolean).sort((a, b) => a - b)[0]
    || order.verifiedAt || order.completedAt || null;
  if (!evidenceAt || !order.paidAt) return [];
  const netCents = require('./commissionLifecycle').cancellationReason(order)
    ? 0 : Math.max(0, cents(order.paidAmount) - cents(order.refundedAmount));
  const paidCents = cents(order.paidAmount);
  const shares = allocations(order, netCents);
  const originalShares = allocations(order, paidCents);
  if (!shares || !originalShares) return [];
  const performers = new Map((order.servicePerformers || []).filter(item => item.role && item.staffId)
    .map(item => [item.role, item.staffId]));
  const serviceShares = shares.filter(item => item.businessType === 'service');
  const delivered = new Map();
  for (const share of serviceShares) {
    const staffId = performers.get(share.teamRole)
      || (serviceShares.length === 1 && performers.size === 0 ? order.fulfillerId : null);
    if (!staffId) continue;
    const item = (order.serviceItemsSnapshot || []).find(row => row.key === share.key);
    const redeemed = (order.redemptions || []).filter(row => row.serviceItemKey === share.key).length;
    const fraction = (order.redemptions || []).length
      ? item ? Math.min(1, redeemed / Math.max(1, item.units || 1))
        : Math.min(1, (order.redemptions || []).length / Math.max(1, order.totalUnits || 1))
      : order.verifiedAt || order.completedAt ? 1 : 0;
    if (fraction <= 0) continue;
    const key = String(staffId);
    const current = delivered.get(key) || { staffId, basisCents: 0, originalBasisCents: 0,
      evidenceAt };
    const original = originalShares.find(row => row.key === share.key);
    current.basisCents += Math.round(share.amountCents * fraction);
    current.originalBasisCents += original?.amountCents || 0;
    delivered.set(key, current);
  }
  return [...delivered.values()];
}

function serviceVolumeEvents(order) {
  if (!['paid', 'refunded'].includes(order.paymentStatus) || !order.paidAt) return [];
  const netCents = require('./commissionLifecycle').cancellationReason(order)
    ? 0 : Math.max(0, cents(order.paidAmount) - cents(order.refundedAmount));
  const shares = allocations(order, netCents);
  if (!shares) return [];
  const serviceShares = shares.filter(item => item.businessType === 'service');
  const performers = new Map((order.servicePerformers || []).filter(item => item.role && item.staffId)
    .map(item => [item.role, item.staffId]));
  const events = [];
  for (const share of serviceShares) {
    const staffId = performers.get(share.teamRole)
      || (serviceShares.length === 1 && performers.size === 0 ? order.fulfillerId : null);
    if (!staffId) continue;
    const item = (order.serviceItemsSnapshot || []).find(row => row.key === share.key);
    const redemptions = (order.redemptions || []).filter(row => !item || row.serviceItemKey === share.key)
      .sort((a, b) => a.sequence - b.sequence);
    const units = Math.max(1, item?.units || order.totalUnits || 1);
    if (redemptions.length) {
      redemptions.slice(0, units).forEach((redemption, index) => {
        if (!redemption.redeemedAt) return;
        events.push({ staffId, key: share.key, sequence: redemption.sequence,
          at: redemption.redeemedAt,
          amountCents: Math.round(share.amountCents * (index + 1) / units)
            - Math.round(share.amountCents * index / units) });
      });
    } else if ((order.verifiedAt || order.completedAt) && !(order.redemptions || []).length) {
      events.push({ staffId, key: share.key, sequence: 0, at: order.verifiedAt || order.completedAt,
        amountCents: share.amountCents });
    }
  }
  return events;
}

async function syncOrderServices(order) {
  if (!order?._id || !order.tenantId || !order.paidAt) return;
  const delivered = deliveredServiceShares(order);
  if (!delivered.length && !order.verifiedAt && !order.completedAt
    && !(order.redemptions || []).length) return;
  for (const item of delivered) {
    const source = { tenantId: order.tenantId, sourceType: 'orderService',
      sourceId: order._id, sourceKey: String(item.staffId) };
    const existing = await PartnerTeamEarning.findOne(source);
    let relation, rule;
    if (existing) {
      rule = { calculationType: existing.calculationType, basisPoints: existing.basisPoints,
        amountCents: existing.fixedCents };
    } else {
      relation = await PartnerTeamRelation.findOne({ tenantId: order.tenantId,
        memberType: 'staff', memberId: item.staffId, ...activeAt(item.evidenceAt) }).lean();
      if (!relation) continue;
      rule = await PartnerTeamRule.findOne({ tenantId: order.tenantId, relationId: relation._id,
        activity: 'service', ...activeAt(item.evidenceAt) }).sort({ version: -1 }).lean();
      if (!rule) continue;
    }
    const accruedCents = amountFor(rule, item.basisCents, item.originalBasisCents);
    if (!existing) {
      try {
        await PartnerTeamEarning.create({ ...source, orderId: order._id,
          relationId: relation._id, ruleId: rule._id, ruleVersion: rule.version,
          leaderType: relation.leaderType, leaderId: relation.leaderId,
          memberType: 'staff', memberId: item.staffId, activity: 'service',
          calculationType: rule.calculationType, basisPoints: rule.basisPoints,
          fixedCents: rule.amountCents, basisCents: item.basisCents, accruedCents,
          status: statusFor('pending', accruedCents, 0, 0),
          eligibleAt: new Date(Math.max(new Date(item.evidenceAt).getTime(),
            new Date(order.paidAt).getTime() + 30 * 86400000)),
          ledger: [{ kind: 'accrual', amountCents: accruedCents, at: new Date() }] });
      } catch (error) { if (error.code !== 11000) throw error; }
      continue;
    }
    const nextStatus = statusFor('pending', accruedCents, existing.paidCents, existing.recoveredCents);
    if (existing.basisCents === item.basisCents && existing.accruedCents === accruedCents
      && existing.status === nextStatus) continue;
    await PartnerTeamEarning.findOneAndUpdate({ _id: existing._id, updatedAt: existing.updatedAt }, {
      $set: { basisCents: item.basisCents, accruedCents, status: nextStatus },
      ...(existing.accruedCents !== accruedCents ? { $push: { ledger: {
        kind: 'recalculation', amountCents: accruedCents - existing.accruedCents, at: new Date(),
      } } } : {}),
    });
  }
  const stale = await PartnerTeamEarning.find({ tenantId: order.tenantId,
    orderId: order._id, sourceType: 'orderService',
    sourceKey: { $nin: delivered.map(item => String(item.staffId)) }, accruedCents: { $gt: 0 } });
  for (const row of stale) await PartnerTeamEarning.findOneAndUpdate({ _id: row._id,
    updatedAt: row.updatedAt }, { $set: { basisCents: 0, accruedCents: 0,
    status: statusFor('cancelled', 0, row.paidCents, row.recoveredCents) },
    $push: { ledger: { kind: 'recalculation', amountCents: -row.accruedCents,
      at: new Date() } } });
}

module.exports = { syncSource, syncOrderServices, deliveredServiceShares, serviceVolumeEvents,
  amountFor, statusFor };
