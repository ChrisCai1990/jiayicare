const VITAL_KEYS = {
  weight: { type: 'weight', label: '体重', unit: 'kg' },
  bloodSugar: { type: 'bloodSugar', label: '血糖', unit: 'mmol/L' },
  heartRate: { type: 'heartRate', label: '心率', unit: '次/分' },
  systolic: { type: 'bloodPressure', field: 'sys', label: '收缩压', unit: 'mmHg' },
  diastolic: { type: 'bloodPressure', field: 'dia', label: '舒张压', unit: 'mmHg' },
};
const OPERATORS = ['lte', 'gte', 'lt', 'gt', 'eq'];
const numeric = value => {
  const raw = String(value ?? '').trim();
  return /^-?\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : null;
};
const day = value => value instanceof Date
  ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)
  : String(value || '').slice(0, 10);

function validate(metric) {
  if (metric == null) return true;
  if (typeof metric !== 'object' || Array.isArray(metric)) return false;
  if (!['vital', 'report_item'].includes(metric.source)) return false;
  if (metric.source === 'vital' && !VITAL_KEYS[metric.key]) return false;
  if (metric.source === 'report_item' && (typeof metric.name !== 'string' || !metric.name.trim() || metric.name.length > 100)) return false;
  if (metric.operator && !OPERATORS.includes(metric.operator)) return false;
  if (metric.targetValue !== undefined && metric.targetValue !== '' && numeric(metric.targetValue) === null) return false;
  if (metric.unit !== undefined && (typeof metric.unit !== 'string' || metric.unit.length > 30)) return false;
  return true;
}

function points(metric, healthRecords = [], reports = [], period) {
  if (!validate(metric) || !metric) return [];
  const start = day(period.start), end = day(period.end);
  const requestedUnit = String(metric.unit || (metric.source === 'vital' ? VITAL_KEYS[metric.key].unit : '')).trim();
  const values = [];
  if (metric.source === 'vital') {
    const spec = VITAL_KEYS[metric.key];
    for (const record of healthRecords) {
      const date = day(record.recordedAt);
      if (record.type !== spec.type || date < start || date > end) continue;
      const value = numeric(spec.field ? record.extra?.[spec.field] : record.value);
      const unit = String(record.unit || spec.unit).trim();
      if (value !== null && unit === requestedUnit) values.push({ sourceId: String(record._id), date, at: new Date(record.recordedAt).toISOString(), value, unit, source: 'health_record' });
    }
  } else {
    const name = metric.name.trim();
    for (const report of reports) {
      const date = day(report.checkDate);
      if (date < start || date > end) continue;
      for (const item of report.reportItems || []) {
        if (String(item.name || '').trim() !== name) continue;
        const value = numeric(item.value), unit = String(item.unit || '').trim();
        if (value !== null && unit === requestedUnit) values.push({ sourceId: String(report._id), itemId: String(item.itemId || ''), date, value, unit, source: 'audited_report' });
      }
    }
  }
  return values.sort((a, b) => a.date.localeCompare(b.date) || String(a.at || '').localeCompare(String(b.at || '')) || a.sourceId.localeCompare(b.sourceId));
}

function metricEvidence(metric, healthRecords, reports, period) {
  const observed = points(metric, healthRecords, reports, period);
  if (!observed.length) return { count: 0, first: null, latest: null, change: null, target: null };
  const first = observed[0], latest = observed.at(-1);
  const sameDayReports = observed.filter(point => point.source === 'audited_report' && point.date === latest.date);
  if (latest.source === 'audited_report' && new Set(sameDayReports.map(point => point.value)).size > 1) {
    return { count: observed.length, first, latest: null, change: null, target: null, ambiguous: true };
  }
  const targetValue = numeric(metric.targetValue);
  return { count: observed.length, first, latest, change: observed.length > 1 ? Number((latest.value - first.value).toFixed(3)) : null,
    target: targetValue === null || !metric.operator ? null : { operator: metric.operator, value: targetValue, unit: latest.unit,
      difference: Number((latest.value - targetValue).toFixed(3)) } };
}

module.exports = { VITAL_KEYS, validate, numeric, points, metricEvidence };
