const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMetrics, selectedFromAnnualPlan, OBJECTIVE_METRICS, SUBJECTIVE_METRICS } = require('../../shared/nutritionComparisonMetrics.cjs');

test('健康顾问选择客观与主观指标，体重可以勾选，固定体成分项不重复录入', () => {
  assert.deepEqual(normalizeMetrics(['体重', '空腹血糖', '空腹血糖', '血尿酸', '睡眠质量', '骨骼肌']), ['体重', '空腹血糖', '尿酸', '睡眠质量']);
  assert(OBJECTIVE_METRICS.some(([name]) => name === '肝脏纤维弹性超声'));
  assert(SUBJECTIVE_METRICS.includes('消化功能'));
  assert.throws(() => normalizeMetrics(Array(30).fill('血糖')), /最多选择29个/);
  assert.throws(() => normalizeMetrics(['异常\n指标']), /名称无效/);
});

test('优先读取年度标准营养评估；旧个性化营养事项只作历史兼容', () => {
  const plan = { moduleData: { nutrition_assessment: { enabled: true, nutritionComparisonMetrics: ['糖化血红蛋白'] },
    personalized_followups: { records: [{ directNutritionAssessment: true, nutritionComparisonMetrics: ['血尿酸'] }] } } };
  assert.deepEqual(selectedFromAnnualPlan(plan), ['糖化血红蛋白']);
  assert.deepEqual(selectedFromAnnualPlan({ moduleData: { personalized_followups: plan.moduleData.personalized_followups } }), ['尿酸']);
});
