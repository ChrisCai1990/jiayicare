const test = require('node:test');
const assert = require('node:assert/strict');
const { fromPlan } = require('../src/utils/annualStandardGoals');
const { goalReviews } = require('../src/utils/managementReviewGoals');
const { managementTargets } = require('../src/utils/annualManagementEvidence');

test('confirmed management directions automatically receive concise goals', () => {
  const rows = managementTargets([{ id: 'management_issue:eye', content: { problem: '右眼视力下降', direction: 'medical_treatment', reportTitle: '眼科报告', action: '眼科就医' } }]);
  assert.equal(rows[0].goal, '及时完成就医，明确诊治方案');
  assert.equal(rows[0].sourceTitle, '右眼视力下降');
});

test('published plan without explicit goals still supplies standard goals for phase review', () => {
  const plan = { _id: 'plan-1', confirmedAt: new Date('2026-10-01T00:00:00Z'), moduleData: {
    medical_treatment: { records: [{ department: '眼科', sourceIds: ['management_issue:eye'], visit_time: '2026-11-01' }] },
    checkup_completion: { records: [{ items: '眼底照相', time: '2026-11-01' }] },
  } };
  const defaults = fromPlan(plan);
  assert.equal(defaults[0].goal, '及时完成就医，明确诊治方案');
  assert.equal(defaults[0].issueId, 'management_issue:eye');
  assert.equal(defaults[1].goal, '完成检查，明确结果与后续处理方向');
  const reviewed = goalReviews([plan], [], { start: '2026-10-01', end: '2026-12-31' });
  assert.equal(reviewed.length, 2);
  assert.equal(reviewed[0].goal, defaults[0].goal);
});
