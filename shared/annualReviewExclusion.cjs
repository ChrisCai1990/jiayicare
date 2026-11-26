// Match the original confirmed recommendation, including its due date. A changed
// recommendation is reviewed again, even when it comes from the same source.
function reviewKey(row) {
  if (!row?.sourceIds?.length || !row.reviewItems?.length) return '';
  return JSON.stringify([[...row.sourceIds].sort(), [...row.reviewItems].sort(), row.screeningSuggestedDate || row.time || '']);
}

function isExcluded(module, row) {
  return Boolean(module?.excludedReviewKeys?.includes(reviewKey(row)));
}

module.exports = { reviewKey, isExcluded };
