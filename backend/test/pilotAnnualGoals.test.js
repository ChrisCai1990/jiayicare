const test = require('node:test');
const assert = require('node:assert/strict');
const { candidates, normalize } = require('../src/utils/pilotAnnualGoals');

const plan = { _id: 'plan-1', moduleData: {
  medical_treatment: { records: [{ name: '门诊', sourceIds: ['priority:0'] }] },
  abnormal_followup: { records: [{ name: '复查' }] },
} };

test('published plan actions offer stable goal candidates without inventing outcomes', () => {
  assert.deepEqual(candidates(plan).map(row => row.issueId), ['priority:0', 'plan-action:plan-1:abnormal_followup:0']);
  const [goal] = normalize(plan, [{ issueId: 'priority:0', goal: '核对门诊结果', focus: '取得专家意见', goalDimension: '' }], new Date('2026-11-17T00:00:00Z'));
  assert.equal(goal.effectiveAt.toISOString(), '2026-11-17T00:00:00.000Z');
  assert.equal(goal.sourceTitle, '门诊');
  assert.equal(goal.baseline, '');
});

test('goal revision rejects missing or duplicate source and preserves unchanged effective date', () => {
  const old = { ...plan, moduleData: { ...plan.moduleData, management_targets: { records: [{
    issueId: 'priority:0', goal: '核对门诊结果', focus: '取得专家意见', baseline: '', goalDimension: '',
    symptomTerm: '', lifestyleType: '', goalMetric: null, nutritionRelevant: false, rehabRelevant: false,
    effectiveAt: new Date('2026-11-17T00:00:00Z'),
  }] } } };
  const input = { issueId: 'priority:0', goal: '核对门诊结果', focus: '取得专家意见', goalDimension: '' };
  assert.equal(normalize(old, [input], new Date('2026-11-20T00:00:00Z'))[0].effectiveAt.toISOString(), '2026-11-17T00:00:00.000Z');
  assert.throws(() => normalize(old, [input, input]), /重复/);
  assert.throws(() => normalize(old, [{ ...input, issueId: 'other' }]), /已变化/);
});
