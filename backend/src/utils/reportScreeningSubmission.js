const { resolveActiveScreeningKey } = require('./screeningCatalogKey');

function validateReportScreeningSubmission(items, activeCategories) {
  const issues = [];
  (items || []).forEach((item, index) => {
    const keys = [...new Set([
      ...(Array.isArray(item?.screeningKeys) ? item.screeningKeys : []),
      item?.screeningKey,
    ].map(value => String(value || '').trim()).filter(Boolean))];
    let reason = '';
    if (item?.matchStatus !== 'matched' || keys.length === 0) reason = 'unclassified';
    else if (keys.length > 1) reason = 'multiple_candidates';
    else if (!resolveActiveScreeningKey(activeCategories, keys[0])) reason = 'invalid_classification';
    if (reason) issues.push({
      index,
      sourceItemId: String(item?.sourceItemId || ''),
      name: String(item?.name || `第${index + 1}项`),
      reason,
      screeningKeys: keys,
    });
  });
  return { complete: issues.length === 0, issues };
}

module.exports = { validateReportScreeningSubmission };
