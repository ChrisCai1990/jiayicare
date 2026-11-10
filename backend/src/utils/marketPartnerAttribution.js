const MarketPartner = require('../models/MarketPartner');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const MarketPartnerAttribution = require('../models/MarketPartnerAttribution');

async function activeRule(tenantId, productId, at = new Date()) {
  return MarketPartnerRule.findOne({ tenantId, productId, status: 'active',
    effectiveFrom: { $lte: at }, $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] })
    .sort({ effectiveFrom: -1 }).lean();
}

async function claim({ tenantId, patientId, productId, code, at = new Date() }) {
  const rule = await activeRule(tenantId, productId, at);
  if (!rule) return null;
  const partner = await MarketPartner.findOne({ tenantId, referralCode: String(code || '').trim().toUpperCase(),
    productLine: rule.productLine, status: 'active' }).select('_id').lean();
  if (!partner) return null;
  const attribution = await MarketPartnerAttribution.create({ tenantId, partnerId: partner._id, patientId,
    productLine: rule.productLine, productId, source: 'code', referralCode: String(code).trim().toUpperCase(),
    effectiveAt: at, expiresAt: new Date(at.getTime() + 30 * 86400000), status: 'approved' });
  return { attribution, rule };
}

async function resolveForOrder({ tenantId, patientId, productId, code, at = new Date() }) {
  const rule = await activeRule(tenantId, productId, at);
  if (!rule) return null;
  if (code) {
    const current = await claim({ tenantId, patientId, productId, code, at });
    if (current) return current;
  }
  const attribution = await MarketPartnerAttribution.findOne({ tenantId, patientId, productLine: rule.productLine,
    productId, status: 'approved', effectiveAt: { $lte: at }, expiresAt: { $gt: at } }).sort({ effectiveAt: -1 }).lean();
  if (!attribution) return null;
  const partner = await MarketPartner.findOne({ _id: attribution.partnerId, tenantId, status: 'active',
    productLine: rule.productLine }).select('_id').lean();
  return partner ? { attribution, rule } : null;
}

module.exports = { activeRule, claim, resolveForOrder };
