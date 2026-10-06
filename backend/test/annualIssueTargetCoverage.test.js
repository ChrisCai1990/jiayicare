const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileAnnualIssueTargets } = require('../src/utils/caseReviewManagementTargets');

test('complete issue cards fill draft targets omitted by same-line extraction', () => {
  const existing = [{ goal: '建立胃黏膜癌前病变规范随访基线', focus: '核实胃镜复查安排', nutritionRelevant: false }];
  const review = [
    '【问题：高血压】', '管理目标：核实血压节律与负荷。',
    '【问题：慢性胃炎（萎缩性+肠化）】', '管理目标：明确随访。',
    '【问题：肺磨玻璃结节】', '管理目标：明确随访。',
    '【问题：直肠息肉、盲肠管状腺瘤、十二指肠球部胃黏膜异位】', '管理目标：明确随访。',
  ].join('\n');
  const result = reconcileAnnualIssueTargets(existing, review);
  assert.equal(result.targets.length, 4);
  assert.equal(result.targets[0].goal, existing[0].goal);
  assert.deepEqual(result.targets.slice(1).map(row => row.goal.split('：')[0]), ['高血压', '肺磨玻璃结节', '直肠息肉、盲肠管状腺瘤、十二指肠球部胃黏膜异位']);
  assert.ok(result.targets.slice(1).every(row => row.focus.includes('健康顾问逐项确认')));
  assert.deepEqual(reconcileAnnualIssueTargets(result.targets, review).targets, result.targets);
});

test('annual target limit reports uncovered issues', () => {
  const existing = Array.from({ length: 12 }, (_, i) => ({ goal: `已确认目标${i}`, focus: '逐项核对' }));
  const result = reconcileAnnualIssueTargets(existing, '【问题：肺磨玻璃结节】\n管理目标：复核');
  assert.equal(result.targets.length, 12);
  assert.deepEqual(result.uncovered, ['肺磨玻璃结节']);
});
