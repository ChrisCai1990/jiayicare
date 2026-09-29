const SUMMARY_FIELDS = ['chiefComplaint', 'presentIllness', 'physicalExam', 'epidemiologicalHistory', 'initialDiagnosis', 'currentMedication'];
const SOURCE_FIELDS = ['sourceType', 'sourceInstitution', 'sourceDepartment', 'sourceDoctor', 'verificationStatus'];
const summaryKey = summary => JSON.stringify([...SUMMARY_FIELDS, ...SOURCE_FIELDS].map(key => String(summary?.[key] || '').trim()));
function groupSummaryHistory(history = []) {
  const groups = [];
  for (const item of history) {
    const previous = groups[groups.length - 1];
    const stamp = { at: item.archivedAt, by: item.archivedByName || item.updatedByName || '医护人员' };
    if (previous && summaryKey(previous) === summaryKey(item)) {
      previous.saves.push(stamp);
    } else groups.push({ ...item, saves: [stamp] });
  }
  return groups.reverse();
}
const changeStamp = entry => {
  const value = entry.updatedAt || entry.recordedAt;
  return { id: String(entry._id || ''), version: value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : '' };
};
function summaryCoverageState(record) {
  const entries = record.courseEntries || [], covered = record.summary?.coveredChanges;
  const pending = entries.filter(entry => {
    const stamp = changeStamp(entry);
    return Array.isArray(covered) ? !covered.some(item => item.id === stamp.id && item.version === stamp.version)
      : !record.summary?.updatedAt || !stamp.version || new Date(stamp.version) > new Date(record.summary.updatedAt);
  });
  const dates = entries.map(e => e.occurredAt).filter(Boolean).sort((a,b) => new Date(a) - new Date(b));
  return { pendingCount: pending.length, coverageKnown: Array.isArray(covered), latestOccurredAt: dates.at(-1) || null };
}
module.exports = { SUMMARY_FIELDS, summaryKey, groupSummaryHistory, changeStamp, summaryCoverageState };
