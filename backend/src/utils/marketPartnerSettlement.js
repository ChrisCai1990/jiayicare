const Order = require('../models/Order');
const Refund = require('../models/Refund');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const MarketPartnerCommission = require('../models/MarketPartnerCommission');
const MarketPartnerReceipt = require('../models/MarketPartnerReceipt');
const Payment = require('../models/Payment');
const { commissionCents } = require('./partnerCommissionPolicy');

const cents = value => Math.round(Number(value || 0) * 100);
const monthKey = date => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 7);
function tierFinalAt(salesMonth) {
  const monthEnd = new Date(`${salesMonth}-01T00:00:00+08:00`);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  return new Date(monthEnd.getTime() + 30 * 86400000);
}

function policyFromRule(rule) {
  return { kind: rule.kind, first: rule.firstBasisPoints,
    tiers: rule.tierBasisPoints?.length ? rule.tierBasisPoints : null,
    renewals: Object.fromEntries((rule.renewalBasisPoints || []).map(item => [item.year, item.basisPoints])),
    directReferralRequired: rule.directReferralRequired, quickClose: rule.quickCloseEnabled };
}

async function refundedCashCents(orderId) {
  const rows = await Refund.aggregate([
    { $match: { order: orderId, status: 'succeeded' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  return cents(rows[0]?.amount || 0);
}

async function verifiedCashCents(order) {
  if (order.paymentMethod === 'onsite') {
    const receipt = await MarketPartnerReceipt.findOne({ tenantId: order.tenantId,
      orderId: order._id, status: 'approved' }).lean();
    return receipt && receipt.amountCents === cents(order.paidAmount) ? receipt.amountCents : null;
  }
  if (order.paymentMethod !== 'wechat') return null;
  const payment = await Payment.findOne({ ...require('./checkoutAmounts').paymentOrderQuery(order._id),
    channel: 'wechat_pay', status: 'succeeded' }).lean();
  return payment ? cents(order.paidAmount) : null;
}

async function paidPeriodNumber(order, rule) {
  if (rule.kind === 'every') return 1;
  const productIds = await MarketPartnerRule.distinct('productId', { tenantId: order.tenantId, productLine: rule.productLine });
  const priorOrders = await Order.find({ tenantId: order.tenantId, user: order.user,
    serviceId: { $in: productIds.map(String) }, paymentStatus: 'paid',
    refundStatus: { $ne: 'refunded' },
    $or: [{ paidAt: { $lt: order.paidAt } }, { paidAt: order.paidAt, _id: { $lt: order._id } }] })
    .select('_id paidAmount paymentMethod tenantId').lean();
  let verified = 0;
  for (const previous of priorOrders) {
    if ((await verifiedCashCents(previous)) > 0) verified += 1;
  }
  return verified + 1;
}

async function qualifiedMonthlyCount(order, rule, now) {
  if (!rule.tierBasisPoints?.length) return 1;
  const salesMonth = monthKey(order.paidAt);
  if (now < tierFinalAt(salesMonth)) return 1;
  const rows = await MarketPartnerCommission.find({ tenantId: order.tenantId, partnerId: order.marketPartnerId,
    salesMonth, periodNumber: 1, status: { $ne: 'cancelled' } })
    .select('patientId').lean();
  return Math.max(1, new Set(rows.map(item => String(item.patientId))).size);
}

function maturity(order, now, finalizationAt = null) {
  const paidAt = new Date(order.paidAt);
  const firstDate = new Date(paidAt.getTime() + 7 * 86400000);
  const finalDate = new Date(Math.max(paidAt.getTime() + 30 * 86400000,
    finalizationAt ? new Date(finalizationAt).getTime() : 0));
  const startedAt = order.serviceStartedAt && new Date(order.serviceStartedAt);
  const firstEligibleAt = startedAt && Number.isFinite(startedAt.getTime())
    ? new Date(Math.max(firstDate.getTime(), startedAt.getTime())) : null;
  return { firstEligibleAt, finalEligibleAt: finalDate,
    firstReady: !!firstEligibleAt && now >= firstEligibleAt && !['requested', 'processing'].includes(order.refundStatus),
    finalReady: !!firstEligibleAt && now >= firstEligibleAt && now >= finalDate
      && !['requested', 'processing'].includes(order.refundStatus) };
}

function statusFor({ accruedCents, paidCents, firstReady }) {
  if (paidCents > accruedCents) return 'reversal_due';
  if (accruedCents === 0) return 'cancelled';
  if (paidCents === accruedCents) return 'paid';
  if (paidCents > 0) return 'partially_paid';
  return firstReady ? 'pending' : 'estimated';
}

async function syncOrder(order, now = new Date()) {
  if (process.env.MARKET_PARTNER_ENABLED !== 'true' || !order?.marketPartnerId || !order.marketPartnerRuleId
    || !order.paidAt || !['paid', 'refunded'].includes(order.paymentStatus)) return null;
  const rule = await MarketPartnerRule.findOne({ _id: order.marketPartnerRuleId, tenantId: order.tenantId,
    version: order.marketPartnerRuleVersion }).lean();
  if (!rule) throw new Error('合伙人订单缺少原始规则版本');
  const paidCashCents = await verifiedCashCents(order);
  if (paidCashCents === null) return null;
  const refundCents = await refundedCashCents(order._id);
  const eligibleCashCents = Math.max(0, paidCashCents - refundCents);
  const periodNumber = await paidPeriodNumber(order, rule);
  const monthlyQualifiedCount = await qualifiedMonthlyCount(order, rule, now);
  const calculated = commissionCents({ paidCents: eligibleCashCents, policy: policyFromRule(rule), periodNumber,
    monthlyQualifiedCount, directReferral: order.marketPartnerDirectReferral === true,
    firstConversationAt: order.marketPartnerFirstConversationAt, paidAt: order.paidAt,
    quickCloseCapCents: rule.quickCloseCapCents });
  const ready = maturity(order, now, rule.tierBasisPoints?.length ? tierFinalAt(monthKey(order.paidAt)) : null);
  const key = `${eligibleCashCents}:${periodNumber}:${monthlyQualifiedCount}:${calculated.totalCents}`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await MarketPartnerCommission.findOne({ tenantId: order.tenantId, orderId: order._id,
      partnerId: order.marketPartnerId });
    if (!current) {
      try {
        return await MarketPartnerCommission.create({ tenantId: order.tenantId, partnerId: order.marketPartnerId,
          patientId: order.user, orderId: order._id, attributionId: order.marketPartnerAttributionId,
          ruleId: rule._id, ruleVersion: rule.version, periodNumber, salesMonth: monthKey(order.paidAt),
          eligibleCashCents, basisPoints: calculated.basisPoints, quickCloseCents: calculated.quickCloseCents,
          accruedCents: calculated.totalCents, status: statusFor({ accruedCents: calculated.totalCents,
            paidCents: 0, firstReady: ready.firstReady }), serviceStartedAt: order.serviceStartedAt || null,
          firstEligibleAt: ready.firstEligibleAt, finalEligibleAt: ready.finalEligibleAt,
          ledger: [{ key, kind: 'accrual', amountCents: calculated.totalCents, at: now }] });
      } catch (err) { if (err.code !== 11000) throw err; continue; }
    }
    const nextStatus = statusFor({ accruedCents: calculated.totalCents,
      paidCents: current.paidCents, firstReady: ready.firstReady });
    const difference = calculated.totalCents - current.accruedCents;
    if (difference === 0 && current.status === nextStatus
      && String(current.firstEligibleAt || '') === String(ready.firstEligibleAt || '')
      && String(current.finalEligibleAt || '') === String(ready.finalEligibleAt || '')) return current;
    const updated = difference === 0 ? null : await MarketPartnerCommission.findOneAndUpdate({ _id: current._id,
      updatedAt: current.updatedAt }, {
      $set: { eligibleCashCents, periodNumber, basisPoints: calculated.basisPoints,
        quickCloseCents: calculated.quickCloseCents, accruedCents: calculated.totalCents,
        serviceStartedAt: order.serviceStartedAt || null, firstEligibleAt: ready.firstEligibleAt,
        finalEligibleAt: ready.finalEligibleAt, status: nextStatus },
      $push: { ledger: { key: `${key}:${current.ledger.length}`, kind: difference < 0 ? 'refund' : 'recalculation',
        amountCents: difference, at: now } },
    }, { new: true });
    if (updated) return updated;
    if (difference === 0) {
      const maturityUpdate = await MarketPartnerCommission.findOneAndUpdate({ _id: current._id,
        updatedAt: current.updatedAt }, { $set: { status: nextStatus,
          firstEligibleAt: ready.firstEligibleAt, finalEligibleAt: ready.finalEligibleAt,
          serviceStartedAt: order.serviceStartedAt || null } }, { new: true });
      if (maturityUpdate) return maturityUpdate;
    }
  }
  throw new Error('合伙人佣金并发重算冲突');
}

async function refreshOpenCommissions(limit = 2000) {
  const ids = await MarketPartnerCommission.distinct('orderId', {
    status: { $in: ['estimated', 'pending', 'partially_paid', 'paid', 'reversal_due'] },
  });
  for (const id of ids.slice(0, limit)) {
    const order = await Order.findById(id);
    if (order) await syncOrder(order);
  }
  return { checked: Math.min(ids.length, limit), truncated: ids.length > limit };
}

function startScheduler() {
  if (process.env.MARKET_PARTNER_ENABLED !== 'true') return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await require('./tenantScope').runWithoutTenantScope(() => refreshOpenCommissions()); }
    catch (err) { console.error('[market-partner-settlement]', err.message); }
    finally { running = false; }
  };
  setTimeout(run, 10000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}

module.exports = { syncOrder, refreshOpenCommissions, startScheduler, policyFromRule, maturity, statusFor, tierFinalAt,
  verifiedCashCents, refundedCashCents };
