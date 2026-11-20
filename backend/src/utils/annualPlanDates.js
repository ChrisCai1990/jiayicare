const DATE_FIELDS = {
  medical_treatment: 'visit_time', specialist_collab: 'plan_time', checkup_completion: 'time',
  abnormal_followup: 'time', vaccine: 'time', functional_medicine: 'time', annual_checkup: 'date',
  personalized_followups: 'executionDate', health_consensus: 'firstDate', nutrition_assessment: 'executionDate',
};
function canonicalDay(value) {
  const match = String(value || '').trim().match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/);
  if (!match) return '';
  const day = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : '';
}
function normalize(data = {}) {
  const next = { ...data };
  for (const [key, field] of Object.entries(DATE_FIELDS)) {
    const module = data[key];
    if (!module || module.enabled === false) continue;
    const normalizeRow = row => {
      if (!row || typeof row !== 'object') return row;
      let value = row[field];
      // Match the dates already displayed by the annual plan's legacy cards.
      // An explicitly pending or invalid date must still be reviewed.
      if (!value && !row.datePending && row.timingStatus !== 'pending_confirmation'
        && ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(key)) {
        value = row.executionDate || row.visit_time || row.plan_time || row.time || row.date;
      }
      const day = canonicalDay(value);
      return day ? { ...row, [field]: day } : row;
    };
    next[key] = Array.isArray(module.records)
      ? { ...module, records: module.records.map(normalizeRow) } : normalizeRow(module);
  }
  return next;
}
module.exports = { normalize, canonicalDay };
