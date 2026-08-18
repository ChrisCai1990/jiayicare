function buildReportScreeningCandidates(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    const key = item?.screeningKey || item?.screeningKeys?.[0];
    return !key && item?.sourceItemId && String(item?.name || '').trim();
  }).map(item => ({
    sourceItemId: item.sourceItemId,
    itemSnapshot: {
      name: item.name || '', itemType: item.itemType || '', sourcePage: item.sourcePage || null,
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

module.exports = { buildReportScreeningCandidates, mergeScreeningProjectionKeys };
