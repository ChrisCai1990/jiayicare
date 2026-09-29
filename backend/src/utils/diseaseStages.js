const { recordVersion } = require('./diseaseSummary');
const { SUMMARY_FIELDS, changeStamp } = require('../../../shared/diseaseSummary.cjs');
const baseVersion = record => { const { stageDraft, ...base } = record; return recordVersion(base); };
function stageScope(record, cutoff) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '') || Number.isNaN(Date.parse(cutoff)) || new Date(cutoff).toISOString().slice(0,10) !== cutoff) throw new Error('请选择有效的概要截止日期');
  const end = Date.parse(cutoff + 'T23:59:59.999+08:00');
  const entries = record.courseEntries || [];
  const selected = entries.filter(e => e.verificationStatus !== 'pending_verification' && e.occurredAt && !Number.isNaN(Date.parse(e.occurredAt)) && Date.parse(e.occurredAt) <= end);
  if (!selected.length) throw new Error('截止日期内暂无已归档且日期明确的诊疗记录，请先核对时间轴');
  return { record: { ...record, courseEntries: selected }, coveredChanges: selected.map(changeStamp), excludedCount: entries.length - selected.length };
}
function stageFields(body) {
  const summary = {};
  for (const key of SUMMARY_FIELDS) {
    if (typeof body[key] !== 'string' || body[key].length > 10000) throw new Error('请核对概要内容，单项限10000字');
    summary[key] = body[key].trim();
  }
  if (!Object.values(summary).some(Boolean)) throw new Error('概要不能为空');
  return summary;
}
module.exports = { baseVersion, stageScope, stageFields };
