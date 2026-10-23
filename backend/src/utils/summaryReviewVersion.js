const crypto = require('node:crypto');
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .filter(key => key !== '_reviewToken').map(key => [key, canonical(value[key])]));
  return value;
}
function reviewToken(record) {
  // The staff response is JSON, while Mongo records can still contain BSON objects.
  // Hash the same JSON representation on both sides of the request.
  const serialized = JSON.parse(JSON.stringify(record ?? null));
  return crypto.createHash('sha256').update(JSON.stringify(canonical(serialized))).digest('hex');
}
function withReviewTokens(summary) {
  if (!summary) return summary;
  const decorate = entry => ({ ...entry, _reviewToken: reviewToken(entry),
    ...(Array.isArray(entry.records) ? { records: entry.records.map(record => ({ ...record, _reviewToken: reviewToken(record) })) } : {}) });
  return { ...decorate(summary), ...(summary.byYear ? { byYear: Object.fromEntries(Object.entries(summary.byYear).map(([year, entry]) => [year, decorate(entry)])) } : {}) };
}
function resolveReviewRecord(records, token) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return -1;
  const matches = records.map((record, index) => reviewToken(record) === token ? index : -1).filter(index => index >= 0);
  // Ambiguous legacy duplicates must be refreshed/reconciled, never guessed.
  return matches.length === 1 ? matches[0] : -1;
}
module.exports = { reviewToken, withReviewTokens, resolveReviewRecord };
