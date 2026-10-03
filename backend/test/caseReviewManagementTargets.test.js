const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTargets, conclusionFromTargets, fromConfirmedReviews, proposeTargetsFromActions } = require('../src/utils/caseReviewManagementTargets');
const { contentForPlan, nutritionGoalsForPlan } = require('../src/utils/annualNutritionDispatch');

test('已确认研判目标逐条保留来源，营养师只接收营养相关条目', () => {
  const rows = normalizeTargets([
    { goal: '改善空腹血糖', focus: '核实餐次与主食分配', nutritionRelevant: true },
    { goal: '安排眼底检查', focus: '协调就医时间', nutritionRelevant: false },
  ]);
  const imported = fromConfirmedReviews([{ _id: 'review-1', title: '代谢专项研判', conclusion: {
    confirmedAt: '2026-10-03T00:00:00.000Z', managementTargets: rows,
  } }]);
  assert.equal(imported.length, 2);
  assert.equal(imported[0].sourceReviewId, 'review-1');
  assert.equal(imported[0].sourceGoal, '改善空腹血糖');
  const plan = { moduleData: { management_targets: { records: imported }, nutrition_assessment: { nutritionComparisonMetrics: ['空腹血糖'] } } };
  assert.deepEqual(nutritionGoalsForPlan(plan).map(row => row.goal), ['改善空腹血糖']);
  assert.match(contentForPlan(plan), /改善空腹血糖/);
  assert.doesNotMatch(contentForPlan(plan), /安排眼底检查/);
});

test('目标和重点必须成对填写，不能把空行或过长文本确认', () => {
  assert.throws(() => normalizeTargets([{ goal: '改善睡眠' }]), /第 1 条/);
  assert.throws(() => normalizeTargets(Array(13).fill({ goal: '目标', focus: '重点' })), /最多 12 条/);
});

test('仅填写管理目标时生成可确认的结论摘要，保留最多12条目标', () => {
  const rows = normalizeTargets(Array.from({ length: 12 }, (_, index) => ({ goal: `目标${index + 1}`, focus: `重点${index + 1}` })));
  const content = conclusionFromTargets(rows);
  const structured = require('../src/utils/phaseAssessment').toStructuredAssessment(content);
  assert.equal(structured.actions.length, 6);
  assert.match(structured.actions.at(-1), /目标12/);
  assert.equal(conclusionFromTargets([]), '');
});

test('AI仅将格式明确的持续管理行动转为待确认目标，单次就医不臆造目标', () => {
  const rows = proposeTargetsFromActions([
    '目标：改善空腹血糖；干预重点：核实餐次与主食分配；时间/频次：每月；责任角色：营养师',
    '协调眼科就诊；时间：下周；责任角色：健康顾问',
  ]);
  assert.deepEqual(rows, [{ goal: '改善空腹血糖', focus: '核实餐次与主食分配', nutritionRelevant: false }]);
});
