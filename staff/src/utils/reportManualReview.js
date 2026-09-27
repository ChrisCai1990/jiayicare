export function isManualOnlyReport(report) {
  return report?.type === 'home_monitor' || report?.type === 'functional'
    || ['functional_medicine', 'prescription_order', 'outpatient_record', 'inpatient_record'].includes(report?.documentCategory)
}
