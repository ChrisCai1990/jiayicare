const sourceIds = entry => [...new Set([entry.sourceReportId, ...(entry.sourceReportIds || [])].filter(Boolean).map(String))];
function findReportArchive(records, reportId) {
  for (const record of records || []) {
    const entry = (record.courseEntries || []).find(e => sourceIds(e).includes(String(reportId)));
    if (entry) return { recordId:String(record._id), diseaseName:record.name, entry };
  }
  return null;
}
module.exports = { sourceIds, findReportArchive };
