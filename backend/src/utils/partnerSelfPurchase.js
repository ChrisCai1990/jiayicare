const MarketPartner = require('../models/MarketPartner');
const Order = require('../models/Order');

async function partnerSelfPurchaseStatus(user, at = new Date()) {
  const phone = String(user?.phone || '').trim();
  if (!phone || process.env.MARKET_PARTNER_ENABLED !== 'true') return { partner: null, eligible: false };
  const partners = await MarketPartner.find({ tenantId: user.tenantId, phone, status: 'active' })
    .select('_id name phone referralCode productLine segment').limit(2).lean();
  if (partners.length > 1) return { ambiguous: true, partner: null, eligible: false };
  const partner = partners[0] || null;
  if (!partner) return { partner: null, eligible: false };
  const cutoff = new Date(at.getTime() - 30 * 86400000);
  const completed = await Order.exists({ tenantId: user.tenantId, marketPartnerId: partner._id,
    paymentStatus: 'paid', paidAmount: { $gt: 0 }, paidAt: { $lte: cutoff },
    refundedAmount: { $in: [null, 0] }, refundStatus: { $nin: ['pending', 'processing', 'refunded'] } });
  return { partner, eligible: !!completed };
}

module.exports = { partnerSelfPurchaseStatus };
