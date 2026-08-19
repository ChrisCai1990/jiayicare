const { reportItemSourcePages } = require('./reportItemEvidence');

function buildReportScreeningCandidates(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    const key = item?.screeningKey || item?.screeningKeys?.[0];
    return !key && item?.sourceItemId && String(item?.name || '').trim();
  }).map(item => ({
    sourceItemId: item.sourceItemId,
    itemSnapshot: {
      name: item.name || '', itemType: item.itemType || '', sourcePage: item.sourcePage || null,
      sourcePages: reportItemSourcePages(item),
      sourceSection: item.sourceSection || '', orderName: item.orderName || '', status: item.status || '',
    },
  }));
}

function mergeScreeningProjectionKeys(matchedKeys, resolvedCandidates) {
  return [...new Set([
    ...(matchedKeys || []),
    ...(resolvedCandidates || []).filter(item => item?.status === 'resolved').map(item => item.resolvedScreeningKey).filter(Boolean),
  ].map(String))];
}

function buildScreeningProjectionEvents(existingProjections, nextProjections) {
  const existing = new Map((existingProjections || []).filter(item => item?.itemId).map(item => [String(item.itemId), item]));
  const next = new Map((nextProjections || []).filter(item => item?.itemId).map(item => [String(item.itemId), item]));
  return [
    ...[...next.entries()].map(([itemId, item]) => ({
      itemId,
      sourceItemIds: [...new Set((item.sourceItemIds || []).filter(Boolean).map(String))],
      action: 'activated',
      source: item.source || 'automatic_match',
    })),
    ...[...existing.entries()].filter(([itemId]) => !next.has(itemId)).map(([itemId, item]) => ({
      itemId,
      sourceItemIds: [...new Set((item.sourceItemIds || []).filter(Boolean).map(String))],
      action: 'superseded',
      source: 'version_reconcile',
    })),
  ];
}

module.exports = { buildReportScreeningCandidates, mergeScreeningProjectionKeys, buildScreeningProjectionEvents };
