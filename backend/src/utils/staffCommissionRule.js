const StaffCommissionRule = require('../models/StaffCommissionRule');

async function forOrder(order, staffId) {
  const productId = order.annualServiceSnapshot?.packageId || order.serviceId;
  const paidAt = order.paidAt && new Date(order.paidAt);
  if (!staffId || !productId || !paidAt || !Number.isFinite(paidAt.getTime())) return null;
  const rule = await StaffCommissionRule.findOne({ tenantId: order.tenantId, staffId,
    productIds: productId, effectiveFrom: { $lte: paidAt },
    $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: paidAt } }] })
    .sort({ effectiveFrom: -1, version: -1 }).lean();
  return rule ? { ruleType: 'percentage', referrerRate: rule.referrerRate,
    fulfillerRate: rule.fulfillerRate, sourceRuleId: rule._id, sourceRuleVersion: rule.version } : null;
}

module.exports = { forOrder };
