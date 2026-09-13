// Shared policy for uploads, parsing and workbench queries.
const manualOnlyReportFilter = {
  $or: [
    { type: { $in: ['home_monitor', 'functional'] } },
    { documentCategory: 'functional_medicine' },
  ],
};
function isManualOnlyReport(report) {
  return report?.type === 'home_monitor' || report?.type === 'functional'
    || report?.documentCategory === 'functional_medicine';
}
function initializeManualReview(report) {
  if (!isManualOnlyReport(report) || ['audited', 'rejected'].includes(report.audit_status)
      || !['none', 'failed'].includes(report.aiStatus)) return;
  report.aiStatus = 'pending';
  report.parseJob = { status: 'skipped', message: '该资料由人工审核录入，无需AI解析' };
}
module.exports = { isManualOnlyReport, manualOnlyReportFilter, initializeManualReview };
