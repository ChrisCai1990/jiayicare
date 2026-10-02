const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMetrics, selectedFromAnnualPlan } = require('../../shared/nutritionComparisonMetrics.cjs');

test('健康顾问只能显式勾选附加指标，固定四项不重复录入', () => {
  assert.deepEqual(normalizeMetrics(['体重', '空腹血糖', '空腹血糖', '血尿酸']), ['空腹血糖', '血尿酸']);
  assert.throws(() => normalizeMetrics(Array(9).fill('血糖')), /最多选择8个/);
  assert.throws(() => normalizeMetrics(['异常\n指标']), /名称无效/);
});

test('优先读取年度标准营养评估；旧个性化营养事项只作历史兼容', () => {
  const plan = { moduleData: { nutrition_assessment: { enabled: true, nutritionComparisonMetrics: ['糖化血红蛋白'] },
    personalized_followups: { records: [{ directNutritionAssessment: true, nutritionComparisonMetrics: ['血尿酸'] }] } } };
  assert.deepEqual(selectedFromAnnualPlan(plan), ['糖化血红蛋白']);
  assert.deepEqual(selectedFromAnnualPlan({ moduleData: { personalized_followups: plan.moduleData.personalized_followups } }), ['血尿酸']);
});
