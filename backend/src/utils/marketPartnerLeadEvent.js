const MarketPartnerLeadEvent = require('../models/MarketPartnerLeadEvent');

function contributionFromRows(rows) {
  if (!rows.length) return null;
  return { eventId: rows[0]._id, firstConversationAt: rows[0].occurredAt,
    directReferral: rows.some(row => row.directReferral === true),
    directEventId: rows.find(row => row.directReferral === true)?._id || null };
}

async function contributionAtOrder({ tenantId, partnerId, patientId, productId, at = new Date() }) {
  if (!tenantId || !partnerId || !patientId || !productId) return null;
  const rows = await MarketPartnerLeadEvent.find({ tenantId, partnerId, patientId, productId,
    status: 'approved', occurredAt: { $gte: new Date(at.getTime() - 30 * 86400000), $lte: at } })
    .sort({ occurredAt: 1 }).limit(100).select('_id occurredAt directReferral').lean();
  return contributionFromRows(rows);
}

module.exports = { contributionAtOrder, contributionFromRows };
