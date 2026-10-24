const crypto = require('node:crypto');

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function approvedItems(summary, year) {
  const entry = summary?.byYear?.[String(year)] || (!Object.keys(summary?.byYear || {}).length && summary?.sections ? summary : {});
  const records = Array.isArray(entry.records) ? entry.records : (entry.sections ? [entry] : []);
  const record = records.find(row => row.scope === 'doctor' || row.scope === 'all' || (!row.scope && row.sections?.checkup_completeness));
  if (!record) return { approved: false, items: [], version: '' };
  const review = record.sectionReviews?.checkup_completeness;
  const approvedAt = review ? review.status === 'approved' && review.approvedAt : (record.doctorApprovedAt || record.approvedAt);
  if (!approvedAt) return { approved: false, items: [], version: '' };
  const missing = Array.isArray(record.sections?.checkup_completeness?.missing) ? record.sections.checkup_completeness.missing : [];
  const version = hash([record.generatedAt || entry.generatedAt || '', approvedAt, missing]);
  const seen = new Map();
  const items = missing.map(value => String(value || '').trim()).filter(Boolean).map(text => {
    const occurrence = seen.get(text) || 0;
    seen.set(text, occurrence + 1);
    const itemKey = hash([text, occurrence]);
    return { itemKey, sourceKey: `ai_checkup:${version}:${itemKey}`, text };
  });
  return { approved: true, items, version };
}

module.exports = { approvedItems };
