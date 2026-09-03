// Lists keep current findings, file metadata and latest edit attribution.
// Full snapshots/history remain in MongoDB and the existing report-detail API.
const REPORT_LIST_PROJECTION = '-content -staffAuditSnapshot -pageParseHistory -dataEditLog.oldValue -dataEditLog.newValue';

function toReportListItem(document) {
  const report = typeof document.toObject === 'function' ? document.toObject() : document;
  const { content, staffAuditSnapshot, pageParseHistory, dataEditLog, ...item } = report;
  const latestValues = new Map();
  for (const log of Array.isArray(dataEditLog) ? dataEditLog : []) {
    if (log.field !== 'value' || !log.itemName) continue;
    // Preserve the UI's existing rule: last appended value edit for each name.
    latestValues.set(log.itemName, {
      itemName: log.itemName, field: 'value', operatorName: log.operatorName, at: log.at,
    });
  }
  item.dataEditLog = [...latestValues.values()];
  return item;
}

module.exports = { REPORT_LIST_PROJECTION, toReportListItem };
