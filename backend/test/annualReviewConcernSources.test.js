const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestedRiskConcerns, descriptionForYear } = require('../src/utils/annualComprehensiveReview');
const { buildAnnualPlanPreparationChecklist } = require('../src/utils/annualPlanPreparationChecklist');

test('only reviewed material risk dimensions enter annual review as suggestions', () => {
  const dimensions = [
    { key: 'cardiovascular', label: '心血管', level: 'high', factors: ['血压偏高'] },
    { key: 'kidney', label: '肾功能', level: 'low', factors: [] },
  ];
  assert.deepEqual(suggestedRiskConcerns({ dimensions }, 2026), []);
  const rows = suggestedRiskConcerns({ approvedAt: new Date('2026-10-01'), dimensions }, 2026);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, 'ai_risk:2026:cardiovascular');
  assert.equal(rows[0].status, 'suggested');
  assert.match(rows[0].evidence, /血压偏高/);
});

test('annual review defines specialist and nutrition routing without nutrition prescription', () => {
  const description = descriptionForYear(2026);
  assert.match(description, /专科/);
  assert.match(description, /营养师/);
  assert.match(description, /另行制定并发出具体营养干预方案/);
});

test('customer discussion must refer to the current confirmed review version', () => {
  const confirmedAt = new Date('2026-10-03T05:00:00Z');
  const review = { reviewType: 'annual', annualPlanYear: 2026, requiresCustomerDiscussion: true,
    conclusion: { status: 'confirmed', confirmedAt }, customerDiscussion: { status: 'no_change', conclusionConfirmedAt: confirmedAt } };
  const item = () => buildAnnualPlanPreparationChecklist({ year: 2026, caseReviews: [review] }).items.find(row => row.key === 'annual_review_customer_discussion');
  assert.equal(item().complete, true);
  review.conclusion.confirmedAt = new Date('2026-10-03T06:00:00Z');
  assert.equal(item().complete, false);
});
