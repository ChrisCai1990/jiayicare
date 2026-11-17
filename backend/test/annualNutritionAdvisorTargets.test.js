const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeAdvisorTargets } = require('../../shared/annualNutritionAdvisorTargets.cjs');

test('营养相关筛查目标带入异常值和参考目标，顾问修改后保留选择', () => {
  const source = [{ issueId: 'screening:1', nutritionRelevant: true, goal: '血压控制', baseline: '收缩压 145 mmHg',
    goalMetric: { key: 'systolic', operator: 'lte', targetValue: 130, unit: 'mmHg' } }];
  const imported = mergeAdvisorTargets([], source);
  assert.deepEqual(imported, [{ metric: '收缩压', baseline: '收缩压 145 mmHg', target: '≤130mmHg', sourceIssueId: 'screening:1' }]);
  assert.deepEqual(mergeAdvisorTargets([{ ...imported[0], target: '≤125mmHg' }], source), [{ ...imported[0], target: '≤125mmHg' }]);
  assert.deepEqual(mergeAdvisorTargets([], [{ ...source[0], nutritionRelevant: false }]), []);
});
