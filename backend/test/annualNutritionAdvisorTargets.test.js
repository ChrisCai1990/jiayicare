const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeAdvisorTargets } = require('../../shared/annualNutritionAdvisorTargets.cjs');

test('营养相关筛查目标带入异常值和参考目标，顾问修改后保留选择', () => {
  const source = [{ issueId: 'screening:1', nutritionRelevant: true, goal: '血压控制', baseline: '收缩压 145 mmHg',
    goalMetric: { key: 'systolic', operator: 'lte', targetValue: 130, unit: 'mmHg' } }];
  const imported = mergeAdvisorTargets([], source);
  assert.deepEqual(imported, [{ kind: 'metric', metric: '血压', baseline: '收缩压 145 mmHg', target: '≤130mmHg', internalOnly: false, sourceIssueId: 'screening:1' }]);
  assert.deepEqual(mergeAdvisorTargets([{ ...imported[0], target: '≤125mmHg' }], source), [{ ...imported[0], target: '≤125mmHg' }]);
  assert.deepEqual(mergeAdvisorTargets([], [{ ...source[0], nutritionRelevant: false }]), []);
});

test('血脂拆成四项，症状单列，内部指标不进入客户方案', () => {
  const source = [
    { issueId: 'lipid', nutritionRelevant: true, goal: '改善血脂', baseline: '血脂异常' },
    { issueId: 'symptom', nutritionRelevant: true, goal: '改善便秘与睡眠', baseline: '便秘；睡眠差' },
    { issueId: 'internal', nutritionRelevant: true, goal: '降低脂蛋白磷脂酶A2', baseline: '脂蛋白磷脂酶A2升高' },
  ];
  const rows = mergeAdvisorTargets([], source);
  assert.deepEqual(rows.filter(row => ['总胆固醇', '高密度脂蛋白', '低密度脂蛋白', '甘油三酯'].includes(row.metric)).map(row => row.metric),
    ['总胆固醇', '高密度脂蛋白', '低密度脂蛋白', '甘油三酯']);
  assert.equal(rows.find(row => row.metric === '便秘').kind, 'symptom');
  assert.equal(rows.find(row => row.metric === '睡眠').kind, 'symptom');
  assert.equal(rows.find(row => row.metric === '脂蛋白磷脂酶A2').internalOnly, true);
  const { customerModuleData, buildAnnualPlanDisplayItems } = require('../src/utils/annualPlanPresentation');
  const client = customerModuleData({ nutrition_assessment: { enabled: true, advisorTargets: rows, nutritionComparisonMetrics: ['血压', '脂蛋白磷脂酶A2', '同型半胱氨酸'] },
    management_targets: { records: [{ goal: '降低脂蛋白磷脂酶A2', focus: '内部监测' }, { goal: '改善血压', focus: '营养干预' }] } });
  assert.ok(!JSON.stringify(client).includes('脂蛋白磷脂酶A2'));
  assert.ok(!JSON.stringify(client).includes('同型半胱氨酸'));
  assert.ok(!JSON.stringify(buildAnnualPlanDisplayItems(client)).includes('脂蛋白磷脂酶A2'));
});
