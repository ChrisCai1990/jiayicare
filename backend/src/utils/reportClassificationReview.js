function findUnconfirmedMultiClassifiedItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item || !String(item.name || '').trim()) return false;
    const keys = [...new Set([...(Array.isArray(item.screeningKeys) ? item.screeningKeys : []), item.screeningKey].filter(Boolean))];
    return keys.length > 1 && !(item.classificationSource === 'manual' && item.classificationReviewedBy);
  });
}

module.exports = { findUnconfirmedMultiClassifiedItems };
