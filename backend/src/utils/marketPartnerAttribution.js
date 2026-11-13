const MarketPartner = require('../models/MarketPartner');
const MarketPartnerRule = require('../models/MarketPartnerRule');
const MarketPartnerAttribution = require('../models/MarketPartnerAttribution');
const hasPromotion = rule => !!rule && !rule.disabled && (rule.firstBasisPoints > 0
  || (rule.tierBasisPoints || []).some(value => value > 0)
  || (rule.renewalBasisPoints || []).some(value => value.basisPoints > 0));

async function activeRule(tenantId, productId, at = new Date(), partnerId = null) {
  const match = { tenantId, productId, status: 'active',
    effectiveFrom: { $lte: at }, $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] };
  if (partnerId) {
    const personal = await MarketPartnerRule.findOne({ ...match, partnerId })
      .sort({ effectiveFrom: -1, version: -1 }).lean();
    if (personal) return hasPromotion(personal) ? personal : null;
  }
  const generic = await MarketPartnerRule.findOne({ ...match, partnerId: null })
    .sort({ effectiveFrom: -1, version: -1 }).lean();
  return hasPromotion(generic) ? generic : null;
}

async function claim({ tenantId, patientId, productId, code, at = new Date() }) {
  const partner = await MarketPartner.findOne({ tenantId, referralCode: String(code || '').trim().toUpperCase(),
    status: 'active' }).select('_id productLine segment').lean();
  if (!partner) return null;
  const rule = await activeRule(tenantId, productId, at, partner._id);
  if (!rule || (partner.segment ? String(rule.partnerId) !== String(partner._id)
    : rule.productLine !== partner.productLine)) return null;
  const attribution = await MarketPartnerAttribution.create({ tenantId, partnerId: partner._id, patientId,
    productLine: rule.productLine, productId, source: 'code', referralCode: String(code).trim().toUpperCase(),
    effectiveAt: at, expiresAt: new Date(at.getTime() + 30 * 86400000), status: 'approved' });
  return { attribution, rule };
}

async function resolveForOrder({ tenantId, patientId, productId, code, at = new Date() }) {
  if (code) {
    const current = await claim({ tenantId, patientId, productId, code, at });
    if (current) return current;
  }
  const attribution = await MarketPartnerAttribution.findOne({ tenantId, patientId,
    productId, status: 'approved', effectiveAt: { $lte: at }, expiresAt: { $gt: at } }).sort({ effectiveAt: -1 }).lean();
  if (!attribution) return null;
  const partner = await MarketPartner.findOne({ _id: attribution.partnerId, tenantId, status: 'active' })
    .select('_id productLine segment').lean();
  if (!partner) return null;
  const rule = await activeRule(tenantId, productId, at, partner._id);
  return (partner.segment ? String(rule?.partnerId) === String(partner._id)
    : rule?.productLine === partner.productLine) ? { attribution, rule } : null;
}

module.exports = { activeRule, claim, resolveForOrder };
