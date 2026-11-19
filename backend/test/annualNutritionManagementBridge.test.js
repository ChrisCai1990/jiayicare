const test = require('node:test');
const assert = require('node:assert/strict');
const { managementTargets, generationActionEvidence, validatePlanCoverage } = require('../src/utils/annualManagementEvidence');
const { draftModule, buildTask } = require('../src/utils/annualNutritionDispatch');

test('多项顾问确认的营养问题归入同一年度营养评估并保留逐项来源', () => {
  const evidence = ['脂肪肝', '体重异常'].map((problem, index) => ({
    id: `management_issue:${index + 1}`,
    content: { problem, direction: 'nutrition_assessment', goal: `评估${problem}的营养干预方向`,
      action: '营养师核对饮食、体成分与相关报告', source: { name: problem, value: '异常' } },
  }));
  const targets = managementTargets(evidence);
  assert.deepEqual(targets.map(row => row.issueId), evidence.map(row => row.id));
  assert.ok(targets.every(row => row.nutritionRelevant === true && row.sourceGoal === '营养评估'));
  assert.deepEqual(managementTargets(evidence, false).map(row => row.sourceTitle), ['脂肪肝', '体重异常']);
  assert.deepEqual(generationActionEvidence(evidence), []);
  const moduleData = { management_targets: { records: targets },
    nutrition_assessment: draftModule({ management_targets: { records: targets } }) };
  assert.equal(validatePlanCoverage(moduleData, evidence), '');
  assert.match(validatePlanCoverage({ management_targets: { records: targets } }, evidence), /尚未进入营养评估/);
  const plan = { _id: '6a4ef1980f2291549b4ffd8d', year: 2026, moduleData };
  const task = buildTask(plan, { _id: '6a4ef1980f2291549b4ffd8e', assignedNutritionist: 'n1' }, { _id: 'a1' });
  assert.equal(task.theme, '年度标准营养评估');
  assert.deepEqual(task.formData.annualNutritionGoals.map(row => row.issueId), evidence.map(row => row.id));
});
