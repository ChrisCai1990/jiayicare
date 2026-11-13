const { activeRule } = require('./marketPartnerAttribution');
const { rateFor } = require('./partnerCommissionPolicy');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const Order = require('../models/Order');

async function promotableRulesForPartner(tenantId, partner, at = new Date()) {
  const candidates = await MarketPartnerRule.find({ tenantId, status: 'active',
    effectiveFrom: { $lte: at },
    $and: [{ $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] },
      { $or: partner.segment ? [{ partnerId: partner._id }]
        : [{ partnerId: partner._id }, { partnerId: null, productLine: partner.productLine }] }],
  }).select('productId').lean();
  const ids = [...new Set(candidates.map(row => String(row.productId)))];
  const resolved = await Promise.all(ids.map(productId => activeRule(tenantId, productId, at, partner._id)));
  return resolved.filter(rule => rule && (partner.segment
    ? String(rule.partnerId) === String(partner._id) : rule.productLine === partner.productLine));
}

async function ownPriceFor({ tenantId, partner, userId, productId, customerPrice, at = new Date() }) {
  if (!partner || !Number.isFinite(Number(customerPrice)) || Number(customerPrice) < 0) return null;
  const rule = await activeRule(tenantId, productId, at, partner._id);
  if (!rule || (partner.segment ? String(rule.partnerId) !== String(partner._id)
    : rule.productLine !== partner.productLine)) return null;
  let periodNumber = 1;
  if (userId && !(rule.kind === 'every' && rule.repeatBasisPoints == null)) {
    const productIds = rule.kind === 'every' ? [rule.productId]
      : await MarketPartnerRule.distinct('productId', { tenantId, productLine: rule.productLine });
    const priorPaid = await Order.countDocuments({ tenantId, user: userId,
      serviceId: { $in: productIds.map(String) }, paymentStatus: 'paid',
      paidAmount: { $gt: 0 }, refundStatus: { $ne: 'refunded' }, paidAt: { $lt: at } });
    periodNumber = priorPaid + 1;
  }
  const basisPoints = rateFor({ policy: {
    kind: rule.kind, first: rule.firstBasisPoints, repeat: rule.repeatBasisPoints,
    tiers: rule.tierBasisPoints?.length ? rule.tierBasisPoints : null,
    renewals: Object.fromEntries((rule.renewalBasisPoints || []).map(row => [row.year, row.basisPoints])),
    directReferralRequired: rule.directReferralRequired,
  }, periodNumber, monthlyQualifiedCount: 1, directReferral: true });
  if (basisPoints <= 0) return null;
  const customerCents = Math.round(Number(customerPrice) * 100);
  return { price: Math.round(customerCents * (10000 - basisPoints) / 10000) / 100,
    basisPoints, periodNumber, ruleId: rule._id, ruleVersion: rule.version };
}

module.exports = { ownPriceFor, promotableRulesForPartner };
