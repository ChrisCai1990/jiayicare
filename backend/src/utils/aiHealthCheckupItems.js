const crypto = require('node:crypto');

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function approvedDoctorSections(summary, year) {
  const byYear = summary?.byYear || {};
  const entry = byYear[String(year)] || (!Object.keys(byYear).length && summary?.sections ? summary : {});
  const records = Array.isArray(entry.records) ? entry.records : (entry.sections ? [entry] : []);
  const record = records.find(row => row.scope === 'doctor' || row.scope === 'all' || (!row.scope && row.sections?.checkup_completeness));
  if (!record) return {};
  if (record.doctorApprovedAt || record.approvedAt) return record.sections || {};
  return Object.fromEntries(Object.entries(record.sections || {}).filter(([key]) =>
    record.sectionReviews?.[key]?.status === 'approved'));
}
function approvedItems(summary, year) {
  const entry = summary?.byYear?.[String(year)] || (!Object.keys(summary?.byYear || {}).length && summary?.sections ? summary : {});
  const records = Array.isArray(entry.records) ? entry.records : (entry.sections ? [entry] : []);
  const record = records.find(row => row.scope === 'doctor' || row.scope === 'all' || (!row.scope && row.sections?.checkup_completeness));
  if (!record) return { approved: false, items: [], version: '' };
  const sectionApprovedAt = key => {
    const review = record.sectionReviews?.[key];
    return review ? review.status === 'approved' && review.approvedAt : (record.doctorApprovedAt || record.approvedAt);
  };
  const checkupApprovedAt = sectionApprovedAt('checkup_completeness');
  const tumorApprovedAt = sectionApprovedAt('tumor_risk');
  if (!checkupApprovedAt && !tumorApprovedAt) return { approved: false, items: [], version: '' };
  const checkupMissing = checkupApprovedAt && Array.isArray(record.sections?.checkup_completeness?.missing)
    ? record.sections.checkup_completeness.missing : [];
  const tumorMissing = tumorApprovedAt && Array.isArray(record.sections?.tumor_risk?.missing)
    ? record.sections.tumor_risk.missing : [];
  // A reviewed tumor summary can explicitly prioritize an examination even
  // when its separate missing array omitted it. It still needs advisor review.
  const tumorSummary = tumorApprovedAt ? String(record.sections?.tumor_risk?.summary || '') : '';
  const summaryCandidates = tumorSummary.split(/[；;。]/).map(value => value.trim())
    .filter(value => /优先补做|需要补做|需补做|待补做|优先完善/.test(value));
  const listed = [...checkupMissing, ...tumorMissing].map(value => String(value || '').trim());
  const missing = [...listed, ...summaryCandidates.filter(value => !listed.some(item => item && (item.includes(value) || value.includes(item))))];
  const version = hash([record.generatedAt || entry.generatedAt || '', checkupApprovedAt, tumorApprovedAt, missing]);
  const seen = new Map();
  const items = missing.map(value => String(value || '').trim()).filter(Boolean).map(text => {
    const occurrence = seen.get(text) || 0;
    seen.set(text, occurrence + 1);
    const itemKey = hash([text, occurrence]);
    return { itemKey, sourceKey: `ai_checkup:${version}:${itemKey}`, text };
  });
  return { approved: true, items, version };
}

module.exports = { approvedItems, approvedDoctorSections };
