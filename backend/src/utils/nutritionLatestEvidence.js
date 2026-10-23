const checkupKeyMetrics = require('../../../shared/checkupKeyMetrics.cjs');
const rules = require('../../../shared/nutritionComparisonMetrics.cjs');
const { FIXED_METRICS } = require('../../../shared/nutritionTargets.cjs');
const aliases = {
  '血尿酸': '尿酸', UA: '尿酸', '尿酸(UA)': '尿酸',
  ALT: '谷丙转氨酶', '丙氨酸氨基转移酶': '谷丙转氨酶',
  AST: '谷草转氨酶', '天门冬氨酸氨基转移酶': '谷草转氨酶',
  GGT: 'γ-谷氨酰转肽酶', 'γ-谷氨酰转移酶': 'γ-谷氨酰转肽酶',
  '低密度脂蛋白胆固醇': '低密度脂蛋白', 'LDL-C': '低密度脂蛋白',
  '高密度脂蛋白胆固醇': '高密度脂蛋白', 'HDL-C': '高密度脂蛋白',
  HbA1c: '糖化血红蛋白', TC: '总胆固醇', TG: '甘油三酯',
  '骨骼肌量': '骨骼肌', '体脂肪率': '体脂率', '内脏脂肪等级': '内脏脂肪',
};
const names = new Set([...rules.COMMON_METRICS, ...FIXED_METRICS, ...Object.values(checkupKeyMetrics.METRIC_NAMES)]);
function metricName(name) {
  const text = String(name || '').trim();
  if (names.has(text)) return text;
  if (aliases[text]) return aliases[text];
  const bare = text.replace(/[（(][^）)]*[）)]/g, '').trim();
  return names.has(bare) ? bare : aliases[bare] || '';
}
function dateOf(value) {
  const text = value instanceof Date ? value.toISOString() : String(value || '');
  const match = text.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (!match) return '';
  const date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : '';
}
function latestNutritionEvidence(patient = {}, records = [], reports = [], now = new Date()) {
  const candidates = {};
  const today = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  function add(metric, value, unit, measuredAt, source, sourceId, status = 'unknown', referenceRange = '') {
    const date = dateOf(measuredAt);
    if (!names.has(metric) || value == null || !String(value).trim() || !date || date > today) return;
    const entry = { metric, value: String(value).trim(), unit: String(unit || '').trim(), date, source, sourceId: String(sourceId || ''), status: ['abnormal', 'warning', 'danger'].includes(status) ? 'abnormal' : status === 'normal' ? 'normal' : 'unknown', referenceRange: String(referenceRange || '').trim() };
    (candidates[metric] ||= []).push(entry);
  }
  const fields = { weight: ['体重', 'kg'], skelMuscle: ['骨骼肌', 'kg'], bodyFatRate: ['体脂率', '%'], visceralFat: ['内脏脂肪', '级'] };
  for (const row of [patient.bodyComposition, ...(patient.bodyCompHistory || [])].filter(Boolean)) {
    for (const [key, [metric, unit]] of Object.entries(fields)) {
      if (Number(row[key]) > 0 && (key !== 'bodyFatRate' || Number(row[key]) <= 100)) add(metric, row[key], unit, row.measuredAt || row.recordedAt, '体成分记录', row._id);
    }
  }
  for (const row of records) {
    if (row.deletedAt || row.reportId) continue; // Report measurements use the reviewed report and actual exam date below.
    const metric = metricName(row.label) || ({ weight: '体重', bloodPressure: '血压', uricAcid: '尿酸' })[row.type];
    add(metric, row.value, row.unit, row.recordedAt, '健康记录', row._id, row.status);
  }
  for (const report of reports) {
    if (report.audit_status !== 'audited') continue;
    for (const item of report.reportItems || []) {
      if (item.reviewIssues?.length) continue;
      let metric = checkupKeyMetrics.METRIC_NAMES[checkupKeyMetrics.matchingKey(item.name)] || metricName(item.name);
      if (!metric && /超声|彩超|B超|ultrasound/i.test(`${item.name} ${item.modality}`) && /肝/.test(`${item.name} ${item.bodyPart} ${item.diagnosis} ${item.conclusion}`)) metric = /弹性|纤维/.test(item.name) ? '肝脏纤维弹性超声' : '肝脏超声';
      const value = metric?.includes('超声') ? item.conclusion || item.diagnosis || item.value || item.findings : item.value;
      add(metric, value, item.unit, item.examDate || report.checkDate, `已审核报告：${report.title || '检查报告'}`, report._id, item.status, item.referenceRange);
    }
  }
  const latest = {};
  for (const [metric, entries] of Object.entries(candidates)) {
    entries.sort((a,b) => b.date.localeCompare(a.date));
    const current = entries.filter(row => row.date === entries[0].date);
    const unique = [...new Set(current.map(row => `${row.value} ${row.unit}|${row.status}|${row.referenceRange}`))];
    const chosen = entries[0];
    latest[metric] = { ...chosen, status: unique.length > 1 ? 'unknown' : chosen.status, conflict: unique.length > 1, candidates: current,
      baseline: unique.length > 1 ? '' : `${chosen.value} ${chosen.unit}（${chosen.date}；${chosen.source}）` };
  }
  return { latest, metrics: Object.keys(latest).filter(metric => latest[metric].status === 'abnormal' && !latest[metric].conflict) };
}
module.exports = { latestNutritionEvidence, metricName, dateOf };
