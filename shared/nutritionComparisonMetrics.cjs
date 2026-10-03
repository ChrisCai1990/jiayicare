// 年度营养评估指标只决定追踪项目；基线与目标仍由营养师核实。
const OBJECTIVE_METRICS = [
  ['体重', 'kg'], ['血压', 'mmHg'], ['空腹血糖', 'mmol/L'], ['餐后2小时血糖', 'mmol/L'],
  ['糖化血红蛋白', '%'], ['总胆固醇', 'mmol/L'], ['甘油三酯', 'mmol/L'],
  ['低密度脂蛋白', 'mmol/L'], ['高密度脂蛋白', 'mmol/L'], ['尿酸', 'μmol/L'],
  ['谷丙转氨酶', 'U/L'], ['谷草转氨酶', 'U/L'], ['γ-谷氨酰转肽酶', 'U/L'],
  ['同型半胱氨酸', 'μmol/L'], ['脂蛋白磷脂酶A2', 'U/L'],
  ['肝脏超声', ''], ['颈动脉超声', ''], ['肝脏纤维弹性超声', ''],
];
const SUBJECTIVE_METRICS = ['睡眠质量', '消化功能', '日间精力', '情绪状态', '皮肤气色'];
const COMMON_METRICS = [...OBJECTIVE_METRICS.map(([name]) => name), ...SUBJECTIVE_METRICS];
const MAX_METRICS = 29; // 目录全部项目 + 少量自定义项目
const FIXED = new Set(require('./nutritionTargets.cjs').FIXED_METRICS);
const ALIASES = { 收缩压: '血压', 舒张压: '血压', 血尿酸: '尿酸', 低密度脂蛋白胆固醇: '低密度脂蛋白', 高密度脂蛋白胆固醇: '高密度脂蛋白' };

function normalizeMetrics(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new Error('营养评估对比指标格式无效');
  if (value.length > MAX_METRICS) throw new Error(`每项营养评估最多选择${MAX_METRICS}个指标`);
  const result = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new Error('营养评估指标名称无效');
    const metric = ALIASES[item.trim()] || item.trim();
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

module.exports = { OBJECTIVE_METRICS, SUBJECTIVE_METRICS, COMMON_METRICS, MAX_METRICS, normalizeMetrics, selectedFromAnnualPlan };
