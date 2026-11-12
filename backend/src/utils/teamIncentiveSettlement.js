const TeamIncentive = require('../models/TeamIncentive');
const TeamIncentiveRule = require('../models/TeamIncentiveRule');
const { teamIncentiveCents } = require('./teamIncentivePolicy');
const { verifiedCashCents, refundedCashCents } = require('./marketPartnerSettlement');

function statusAfterAdjustment(row, amountCents) {
  if (row.paidCents - (row.recoveredCents || 0) > amountCents) return 'reversal_due';
  if (amountCents === 0) return 'cancelled';
  if (row.status === 'reversal_due' && row.paidCents - (row.recoveredCents || 0) === amountCents) return 'paid';
  if (row.status === 'confirmed') return 'pending';
  return row.status;
}

async function syncOrder(order) {
  if (process.env.MARKET_PARTNER_ENABLED !== 'true' || !order?._id) return;
  const rows = await TeamIncentive.find({ tenantId: order.tenantId, orderId: order._id,
    status: { $in: ['pending', 'confirmed', 'paid', 'reversal_due'] } });
  if (!rows.length) return;
  const verified = await verifiedCashCents(order);
  const netCents = verified === null ? 0 : Math.max(0, verified - await refundedCashCents(order._id));
  for (const row of rows) {
    const rule = await TeamIncentiveRule.findOne({ _id: row.ruleId, tenantId: order.tenantId,
      version: row.ruleVersion }).lean();
    if (!rule) throw new Error('团队激励缺少原始规则版本');
    const allocation = row.serviceItemKey ? require('./serviceItemIncentiveBasis')
      .unitBasis(order, netCents, row.serviceItemKey, row.serviceEvidenceId) : null;
    if (row.serviceItemKey && !allocation) throw new Error('组合激励原始子项或核销证据缺失');
    const basisCents = row.serviceItemKey ? allocation.basisCents : netCents;
    const amountCents = basisCents === 0 ? 0 : teamIncentiveCents({ role: row.role, ruleType: rule.ruleType,
      basisCents, basisPoints: rule.basisPoints, amountCents: rule.amountCents, capCents: rule.capCents });
    if (row.basisCents === basisCents && row.amountCents === amountCents) continue;
    const status = statusAfterAdjustment(row, amountCents);
    await TeamIncentive.findOneAndUpdate({ _id: row._id, updatedAt: row.updatedAt }, {
      $set: { basisCents, amountCents, status },
      $push: { adjustments: { basisCents, amountCents, at: new Date(), reason: '订单实收或退款变化' } },
    });
  }
}

module.exports = { syncOrder, statusAfterAdjustment };
