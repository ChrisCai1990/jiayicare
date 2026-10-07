const test = require('node:test');
const assert = require('node:assert/strict');
const { suggestedRiskConcerns, reviewedChronicConcerns, reviewedCardiovascularConcerns, reviewedTumorConcerns, descriptionForYear } = require('../src/utils/annualComprehensiveReview');
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

test('reviewed abnormal chronic trend enters annual discussion, while normal and unreviewed data do not', () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', doctorApprovedAt: new Date('2026-10-03'),
    sectionReviews: { chronic_disease: { status: 'approved' } },
    sections: { chronic_disease: { items: [
      { name: '血糖', status: 'mild_abnormal', latest: '空腹血糖需关注' },
      { name: '肾功能', status: 'normal', latest: '正常' },
    ] } },
  }] } } };
  const result = reviewedChronicConcerns(summary, 2026);
  assert.equal(result.sourceStatus, 'reviewed');
  assert.deepEqual(result.concerns.map(row => row.title), ['血糖']);
  assert.equal(result.concerns[0].kind, 'ai_health_trend');
  assert.equal(reviewedChronicConcerns(summary, 2025).sourceStatus, 'unreviewed');
  summary.byYear[2026].records[0].sectionReviews.chronic_disease.status = 'pending';
  assert.equal(reviewedChronicConcerns(summary, 2026).concerns.length, 0);
  const fromTags = reviewedChronicConcerns(summary, 2026, { status: 'reviewed', chronic_disease: ['高血压'] });
  assert.equal(fromTags.sourceStatus, 'reviewed');
  assert.deepEqual(fromTags.concerns.map(row => row.title), ['高血压']);
  assert.match(fromTags.concerns[0].evidence, /核对诊断依据/);
});

test('reviewed cardiovascular concerns enter as suggestions, while stable and unreviewed topics do not', () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', doctorApprovedAt: new Date('2026-10-03'),
    sectionReviews: { cardiovascular_risk: { status: 'approved' } },
    sections: { cardiovascular_risk: { topics: [
      { name: '颈动脉超声', status: 'attention', latest: '斑块需关注' },
      { name: '心电图', status: 'monitor', latest: '建议持续监测' },
      { name: '心脏超声', status: 'stable', latest: '基本稳定' },
    ] } },
  }] } } };
  const result = reviewedCardiovascularConcerns(summary, 2026, { status: 'reviewed', cardiovascular_risk: ['颈动脉超声', '血管风险标签'] });
  assert.deepEqual(result.concerns.map(row => row.title), ['颈动脉超声', '心电图', '血管风险标签']);
  assert.ok(result.concerns.every(row => row.status === 'suggested'));
  summary.byYear[2026].records[0].sectionReviews.cardiovascular_risk.status = 'pending';
  assert.deepEqual(reviewedCardiovascularConcerns(summary, 2026).concerns, []);
});

test('reviewed tumor concern tags, including lung ground-glass nodules, enter annual discussion', () => {
  const tags = { status: 'reviewed', reviewedAt: new Date('2026-10-03'), tumor_risk: ['肺磨玻璃结节', '肺磨玻璃结节', '直肠息肉'] };
  const result = reviewedTumorConcerns(2026, tags);
  assert.equal(result.sourceStatus, 'reviewed');
  assert.deepEqual(result.concerns.map(row => row.title), ['肺磨玻璃结节', '直肠息肉']);
  assert.equal(result.concerns[0].kind, 'reviewed_tumor_tag');
  assert.equal(result.concerns[0].status, 'suggested');
  assert.deepEqual(reviewedTumorConcerns(2026, { ...tags, status: 'unreviewed' }).concerns, []);
});

test('annual plan preparation uses confirmed review without a second customer discussion gate', () => {
  const confirmedAt = new Date('2026-10-03T05:00:00Z');
  const review = { reviewType: 'annual', annualPlanYear: 2026, requiresCustomerDiscussion: true,
    conclusion: { status: 'confirmed', confirmedAt }, customerDiscussion: { status: 'pending' } };
  const checklist = buildAnnualPlanPreparationChecklist({ year: 2026, caseReviews: [review] });
  assert.equal(checklist.items.some(row => row.key === 'annual_review_customer_discussion'), false);
  assert.equal(checklist.items.find(row => row.key === 'annual_comprehensive_review').complete, true);
});
