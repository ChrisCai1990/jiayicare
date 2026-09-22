const test = require('node:test');
const assert = require('node:assert/strict');
const criteria = require('../../shared/annualAssessmentCriteria.json');
const { supplementalAssessmentNote } = require('../src/utils/annualAssessmentDecision');
const { markRequiredCaseReviews } = require('../src/utils/annualCaseReviewScope');
const { buildAnnualPlanPreparationChecklist } = require('../src/utils/annualPlanPreparationChecklist');
test('legacy generated labels removed while additional manual content survives in frontend and backend', async () => {
  const value = criteria.map(item => item.label).join('；') + '\n客户沟通补充，保留原话';
  assert.equal(supplementalAssessmentNote(value), '客户沟通补充，保留原话');
  const frontend = await import('../../staff/src/utils/annualAssessmentNote.mjs');
  assert.equal(frontend.supplementalAssessmentNote(value, criteria), supplementalAssessmentNote(value));
  assert.equal(supplementalAssessmentNote(criteria[0].label), '');
});
test('unselected draft does not block; explicitly required pending review names blocker; confirmed resolves', () => {
  const rows = [{ _id: 'a', title: '本次就医问题', conclusion: { status: 'draft' } }];
  const item = ids => buildAnnualPlanPreparationChecklist({ caseReviews: markRequiredCaseReviews(rows, ids) }).items.find(i => i.key === 'case_reviews');
  assert.equal(item([]).complete, true);
  assert.equal(item(['a']).complete, false); assert.match(item(['a']).label, /本次就医问题/);
  rows[0].conclusion.status = 'confirmed'; assert.equal(item(['a']).complete, true);
});
test('missing required review does not silently unlock; unassigned legacy reviews remain optional', () => {
  const rows = markRequiredCaseReviews([], ['missing']);
  assert.equal(rows[0].conclusion.status, 'missing');
  const check = buildAnnualPlanPreparationChecklist({ caseReviews: rows });
  assert.ok(check.blockingKeys.includes('case_reviews'));
  assert.equal(markRequiredCaseReviews([{ _id: 'old' }])[0].required, false);
});
