const test = require('node:test');
const assert = require('node:assert/strict');
const { retireAnnualConcerns, latestSourceApproval, isActiveAnnualConcern } = require('../src/utils/annualConcernRetirement');
const { reviewedNormalGlucoseAfter, reviewedCardiovascularConcerns } = require('../src/utils/annualComprehensiveReview');

const approvedSummary = { byYear: { 2026: { records: [{ scope: 'doctor', doctorApprovedAt: new Date('2026-10-06'),
  sectionReviews: { chronic_disease: { status: 'approved' }, cardiovascular_risk: { status: 'approved' } },
  sections: { chronic_disease: { items: [{ name: '血糖', status: 'normal', latest: 'HbA1c 5.6%' }] }, cardiovascular_risk: { topics: [] } },
}] } } };

test('newer reviewed normal glucose supersedes an older prediabetes tag', () => {
  const tags = { status: 'reviewed', reviewedAt: new Date('2026-10-05'), cardiovascular_risk: ['高血压', '糖尿病前期'] };
  assert.equal(reviewedNormalGlucoseAfter(approvedSummary, 2026, tags.reviewedAt), true);
  assert.deepEqual(reviewedCardiovascularConcerns(approvedSummary, 2026, tags).concerns.map(row => row.title), ['高血压']);
  assert.equal(reviewedNormalGlucoseAfter(approvedSummary, 2026, new Date('2026-10-07')), false);
});

test('doctor approved summary with draft section needs matching audited HbA1c', () => {
  const summary = structuredClone(approvedSummary);
  const record = summary.byYear[2026].records[0];
  record.sectionReviews.chronic_disease.status = 'draft';
  record.sections.chronic_disease.items[0].latest = '2026-09-05 HbA1c 5.6%';
  const sourceDate = new Date('2026-10-05');
  const audited = { date: '2026-09-05', value: '5.6', status: 'normal' };
  assert.equal(reviewedNormalGlucoseAfter(summary, 2026, sourceDate), false);
  assert.equal(reviewedNormalGlucoseAfter(summary, 2026, sourceDate, audited), true);
  assert.equal(reviewedNormalGlucoseAfter(summary, 2026, sourceDate, { ...audited, value: '7.5' }), false);
  const tags = { status: 'reviewed', reviewedAt: sourceDate, cardiovascular_risk: ['糖尿病前期'] };
  assert.deepEqual(reviewedCardiovascularConcerns(summary, 2026, tags, audited).concerns, []);
});

test('generic scans and superseded suggested glucose leave active concerns with audit history', () => {
  const rows = [
    { id: 'risk', key: 'ai_risk:2026:diabetes', kind: 'ai_risk_scan', title: '糖尿病风险', status: 'suggested' },
    { id: 'glucose', key: 'ai_health:2026:chronic_disease:糖代谢异常', kind: 'ai_health_trend', title: '糖代谢异常', status: 'suggested',
      source: { approvedAt: new Date('2026-07-21') }, mergedSources: [{ source: { reviewedAt: new Date('2026-10-05') } }] },
    { id: 'bp', key: 'bp', kind: 'ai_health_trend', title: '高血压', status: 'suggested' },
  ];
  const result = retireAnnualConcerns(rows, { isGlucoseSuperseded: row => reviewedNormalGlucoseAfter(approvedSummary, 2026, latestSourceApproval(row)) });
  assert.deepEqual(result.rows.map(row => row.id), ['bp']);
  assert.equal(result.retired.length, 2);
  assert.equal(result.retired[1].retiredReason.includes('正常'), true);
  assert.equal(isActiveAnnualConcern(rows[0]), false);
});
