export function isManualOnlyReport(report) {
  if (['prescription_order', 'outpatient_record', 'inpatient_record'].includes(report?.documentCategory)) return false
  return report?.type === 'home_monitor' || report?.type === 'functional'
    || report?.documentCategory === 'functional_medicine'
}
