const { examName, examRecords } = require('./completedScreeningExam');
const crypto = require('node:crypto');

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function catalogExam(text, catalogIndex = []) {
  const normalized = require('./screeningMatch').norm(text);
  const matches = catalogIndex.filter(({ cands }) => cands.some(candidate => {
    const alias = candidate.n;
    return alias && alias.length >= 3 && normalized.includes(alias);
  }));
  return matches.length === 1 ? matches[0].node : null;
}
function currentYearExam(reports = [], year, key, catalogIndex = []) {
  if (['chest_ct', 'h_pylori'].includes(key)) return examRecords(reports, key).some(record => record.year === Number(year));
  if (!key.startsWith('catalog:')) return false;
  return reports.some(report => {
    if (report.audit_status && report.audit_status !== 'audited' || report.archiveOnly) return false;
    const date = report.checkDate || report.date;
    const reportYear = date instanceof Date ? date.getUTCFullYear() : Number(String(date || '').slice(0, 4));
    if (reportYear !== Number(year)) return false;
    return (report.reportItems || []).some(item => {
      const expected = key.slice('catalog:'.length);
      const confirmed = [item.screeningKey, ...(item.screeningKeys || [])].filter(Boolean);
      if (confirmed.includes(expected)) return true;
      return catalogExam(item.name || item.orderName || '', catalogIndex)?.id === expected;
    });
  });
}
const EXAM_NAMES = [
  ['colonoscopy', '结肠镜', /结肠镜|肠镜/],
  ['gastroscopy', '胃镜（含食管）', /胃镜/],
  ['chest_ct', '胸部CT', { test: value => examName('chest_ct', value) || /低剂量(?:螺旋)?CT/i.test(value) }],
  ['liver_ultrasound', '肝脏超声', /肝脏超声|肝脏B超/],
  ['h_pylori', '幽门螺杆菌复查', { test: value => examName('h_pylori', value) }],
];
function checkupMeaning(text, catalogIndex = []) {
  const value = String(text || '').trim();
  const names = EXAM_NAMES.filter(([, , pattern]) => pattern.test(value));
  const alreadyDone = /已做|已完成|已检查/.test(value) && !/未做|补做|待做|需做|需要补做|优先补做/.test(value);
  if (alreadyDone && !/年度复查|每年复查|仍需复查|补传|核对资料|确认是否已完成/.test(value)) return null;
  const catalog = names.length ? null : catalogExam(value, catalogIndex);
  const disposition = /确认是否已完成|补传|核对资料/.test(value) ? 'request_records'
    : names.length > 1 ? '' : 'needs_exam';
  return { key: names.length === 1 ? names[0][0] : catalog ? `catalog:${catalog.id}` : value.replace(/\s+/g, ''),
    title: names.length === 1 ? (names[0][0] === 'chest_ct' && /低剂量|LDCT/i.test(value) ? '低剂量胸部CT' : names[0][1]) : catalog?.label || value.slice(0, 80),
    autoDisposition: names.length || catalog ? disposition : '' };
}
function explicitFollowup(text) {
  return /(?:医嘱|遵医嘱|医生要求|原报告建议|根除治疗后|治疗后|术后|结节随访|结节复查|[0-9一二三四六十]+个?月后.{0,8}复查)/.test(text);
}
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
function approvedItems(summary, year, reports = [], catalogIndex = []) {
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
  const rawItems = missing.map(value => String(value || '').trim()).filter(Boolean).map(text => {
    const occurrence = seen.get(text) || 0;
    seen.set(text, occurrence + 1);
    const itemKey = hash([text, occurrence]);
    return { itemKey, sourceKey: `ai_checkup:${version}:${itemKey}`, text };
  });
  const seenMeaning = new Set();
  const items = rawItems.flatMap(item => {
    const meaning = checkupMeaning(item.text, catalogIndex);
    if (!meaning || seenMeaning.has(meaning.key) || (!explicitFollowup(item.text) && currentYearExam(reports, year, meaning.key, catalogIndex))) return [];
    // A narrative mentioning several tests is context, not a separate examination.
    if (!meaning.autoDisposition && EXAM_NAMES.filter(([, , pattern]) => pattern.test(item.text)).some(([key]) => seenMeaning.has(key))) return [];
    seenMeaning.add(meaning.key);
    return [{ ...item, ...meaning }];
  });
  return { approved: true, items, version };
}

module.exports = { approvedItems, approvedDoctorSections, checkupMeaning, currentYearExam, catalogExam, explicitFollowup };
