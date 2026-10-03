const FIXED_METRICS = ['骨骼肌', '体脂率', '内脏脂肪'];
const canonicalMetric = value => {
  const metric = String(value || '').trim();
  if (/^骨骼肌(?:量|质量)?$/.test(metric)) return '骨骼肌';
  if (/^体脂(?:肪)?率$/.test(metric)) return '体脂率';
  if (/^内脏脂肪(?:等级|级别)?$/.test(metric)) return '内脏脂肪';
  return metric;
};

function measuredBaseline(patient, metric) {
  const history = Array.isArray(patient?.bodyCompHistory) ? patient.bodyCompHistory : [];
  const records = [patient?.bodyComposition, ...history.slice().reverse()].filter(Boolean);
  const field = { 体重: 'weight', 骨骼肌: 'skelMuscle', 体脂率: 'bodyFatRate', 内脏脂肪: 'visceralFat' }[metric];
  const unit = { 体重: 'kg', 骨骼肌: 'kg', 体脂率: '%', 内脏脂肪: '级' }[metric];
  for (const record of records) {
    const date = String(record.measuredAt || record.recordedAt || '').slice(0, 10);
    const value = Number(record[field]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value) && value > 0
      && (metric !== '体脂率' || value <= 100)) return `${value} ${unit}（${date}）`;
  }
  return '';
}

function withFixedNutritionTargets(rows = [], patient = {}) {
  const normalized = Array.isArray(rows) ? rows.map(row => ({ metric: canonicalMetric(row?.metric),
    baseline: String(row?.baseline || '').trim(), target: String(row?.target || '').trim() })) : [];
  const fixed = FIXED_METRICS.map(metric => {
    const prior = normalized.find(row => row.metric === metric);
    return { metric, baseline: prior?.baseline || measuredBaseline(patient, metric), target: prior?.target || '' };
  });
  const extras = normalized.filter(row => row.metric && !FIXED_METRICS.includes(row.metric));
  return [...fixed, ...extras].slice(0, 32);
}

module.exports = { FIXED_METRICS, canonicalMetric, measuredBaseline, withFixedNutritionTargets };
