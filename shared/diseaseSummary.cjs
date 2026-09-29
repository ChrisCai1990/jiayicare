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
module.exports = { SUMMARY_FIELDS, summaryKey, groupSummaryHistory };
