// Optional indicators selected by the health advisor for a specific annual-plan
// nutrition assessment item. Selection does not establish a diagnosis or goal.
const COMMON_METRICS = [
  '空腹血糖', '餐后2小时血糖', '糖化血红蛋白',
  '收缩压', '舒张压', '甘油三酯', '低密度脂蛋白胆固醇', '血尿酸',
];
const MAX_METRICS = 8; // Four fixed body metrics + at most eight selected metrics.
const FIXED = new Set(require('./nutritionTargets.cjs').FIXED_METRICS);

function normalizeMetrics(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('营养评估对比指标格式无效');
  if (value.length > MAX_METRICS) throw new Error(`每项营养评估最多选择${MAX_METRICS}个附加指标`);
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('营养评估指标名称无效');
    const metric = item.trim();
    if (!metric || metric.length > 100 || /[\r\n\t<>]/.test(metric)) throw new Error('营养评估指标名称无效');
    if (FIXED.has(metric)) continue;
    if (!result.some(existing => existing.toLowerCase() === metric.toLowerCase())) result.push(metric);
  }
  return result;
}

function selectedFromAnnualPlan(plan) {
  const standard = plan?.moduleData?.nutrition_assessment;
  if (standard && standard.enabled !== false) {
    try { return normalizeMetrics(standard.nutritionComparisonMetrics); } catch { return []; }
  }
  const records = plan?.moduleData?.personalized_followups?.enabled === false
    ? [] : plan?.moduleData?.personalized_followups?.records || [];
  const isNutrition = require('./annualNutrition.cjs').isRow;
  return [...new Set(records.filter(isNutrition).flatMap(row => {
    try { return normalizeMetrics(row.nutritionComparisonMetrics); } catch { return []; }
  }))].slice(0, MAX_METRICS);
}

module.exports = { COMMON_METRICS, MAX_METRICS, normalizeMetrics, selectedFromAnnualPlan };
