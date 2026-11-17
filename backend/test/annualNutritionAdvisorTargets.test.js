const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeAdvisorTargets } = require('../../shared/annualNutritionAdvisorTargets.cjs');

test('营养相关筛查目标带入异常值和参考目标，顾问修改后保留选择', () => {
  const source = [{ issueId: 'screening:1', nutritionRelevant: true, sourceStatus: 'abnormal', goal: '血压控制', baseline: '收缩压 145 mmHg',
    goalMetric: { key: 'systolic', operator: 'lte', targetValue: 130, unit: 'mmHg' } }];
  const imported = mergeAdvisorTargets([], source);
  assert.deepEqual(imported, [{ kind: 'metric', metric: '血压', baseline: '收缩压 145 mmHg', target: '≤130mmHg', internalOnly: false, sourceIssueId: 'screening:1' }]);
  assert.deepEqual(mergeAdvisorTargets([{ ...imported[0], target: '≤125mmHg' }], source), [{ ...imported[0], target: '≤125mmHg' }]);
  assert.deepEqual(mergeAdvisorTargets([], [{ ...source[0], nutritionRelevant: false }]), []);
});

test('血脂拆成四项，症状单列，内部指标不进入客户方案', () => {
  const source = [
    { issueId: 'lipid', nutritionRelevant: true, sourceStatus: 'abnormal', goal: '改善血脂', baseline: '血脂异常' },
    { issueId: 'symptom', nutritionRelevant: true, goal: '改善便秘与睡眠', baseline: '便秘；睡眠差' },
    { issueId: 'internal', nutritionRelevant: true, sourceStatus: 'abnormal', goal: '降低脂蛋白磷脂酶A2', baseline: '脂蛋白磷脂酶A2升高' },
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

test('胃功能三项只带入异常子项，正常数据不进入营养干预或客户视图', () => {
  const source = [
    { issueId: 'pg1', nutritionRelevant: true, sourceStatus: 'abnormal', goal: '胃蛋白酶原I异常需监测', baseline: '胃蛋白酶原I 42 ng/mL' },
    { issueId: 'pg2', nutritionRelevant: true, sourceStatus: 'normal', goal: '胃蛋白酶原II监测', baseline: '胃蛋白酶原II 10 ng/mL' },
    { issueId: 'g17', nutritionRelevant: true, sourceStatus: 'attention', goal: '胃泌素17偏高需监测', baseline: '胃泌素17 18 pmol/L' },
    { issueId: 'normalSugar', nutritionRelevant: true, sourceStatus: 'normal', goal: '空腹血糖监测', baseline: '空腹血糖 5.1 mmol/L' },
  ];
  const rows = mergeAdvisorTargets([], source);
  assert.deepEqual(rows.map(row => row.metric), ['胃蛋白酶原I', '胃泌素17']);
  assert.ok(rows.every(row => row.internalOnly));
  const { customerModuleData, buildAnnualPlanDisplayItems } = require('../src/utils/annualPlanPresentation');
  const client = customerModuleData({ nutrition_assessment: { enabled: true, advisorTargets: rows, nutritionComparisonMetrics: rows.map(row => row.metric) },
    management_targets: { records: source.map(row => ({ goal: row.goal, focus: '', sourceStatus: row.sourceStatus })) } });
  assert.ok(!JSON.stringify(client).includes('胃蛋白酶原'));
  assert.ok(!JSON.stringify(client).includes('胃泌素17'));
  assert.ok(!JSON.stringify(buildAnnualPlanDisplayItems(client)).includes('胃蛋白酶原'));
  const { metricsFromTargets } = require('../../shared/nutritionComparisonMetrics.cjs');
  assert.deepEqual(metricsFromTargets(source), ['胃蛋白酶原I', '胃泌素17']);
});
