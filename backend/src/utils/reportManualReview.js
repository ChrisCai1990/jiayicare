// Shared policy for uploads, parsing and workbench queries.
const manualOnlyReportFilter = {
  $or: [
    { type: 'home_monitor' },
    { type: 'functional', documentCategory: { $nin: ['prescription_order', 'outpatient_record', 'inpatient_record'] } },
    { documentCategory: 'functional_medicine' },
  ],
};
function isManualOnlyReport(report) {
  // 当前人工归类优先于旧 type，避免历史 functional 值把处方锁在人工审核入口。
  if (['prescription_order', 'outpatient_record', 'inpatient_record'].includes(report?.documentCategory)) return false;
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
