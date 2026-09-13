export function isManualOnlyReport(report) {
  return report?.type === 'home_monitor' || report?.type === 'functional'
    || report?.documentCategory === 'functional_medicine'
}
