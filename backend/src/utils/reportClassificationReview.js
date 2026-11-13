function findUnconfirmedMultiClassifiedItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || !String(item.name || '').trim()) return false;
    const keys = [...new Set([...(Array.isArray(item.screeningKeys) ? item.screeningKeys : []), item.screeningKey].filter(Boolean))];
    return keys.length > 1 && !(item.classificationSource === 'manual' && item.classificationReviewedBy);
  });
}

async function collapseStaleAutomaticCandidates(items, classifyItems) {
  const source = Array.isArray(items) ? items : [];
  const candidates = source.map((item, index) => ({ item, index })).filter(({ item }) => {
    if (!item || item.classificationSource === 'manual' || !item.screeningKey) return false;
    return new Set([...(Array.isArray(item.screeningKeys) ? item.screeningKeys : []), item.screeningKey].filter(Boolean)).size > 1;
  });
  if (!candidates.length) return source;
  const fresh = await classifyItems(candidates.map(({ item }) => ({ ...item, screeningKey: '', screeningKeys: [], classificationSource: '' })));
  const resolved = new Map();
  candidates.forEach(({ item, index }, candidateIndex) => {
    const keys = [...new Set([...(fresh[candidateIndex]?.screeningKeys || []), fresh[candidateIndex]?.screeningKey].filter(Boolean))];
    if (keys.length === 1 && keys[0] === item.screeningKey) resolved.set(index, { ...item, screeningKeys: [item.screeningKey] });
  });
  return source.map((item, index) => resolved.get(index) || item);
}

module.exports = { findUnconfirmedMultiClassifiedItems, collapseStaleAutomaticCandidates };
