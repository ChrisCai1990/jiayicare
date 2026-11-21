const test = require('node:test');
const assert = require('node:assert/strict');
const { eligibility } = require('./annualReviewEligibility');
const { buildAnnualPlanPreparationChecklist } = require('./annualPlanPreparationChecklist');

test('近期仅有局部检查时说明完整体检缺口并直达问题报告', () => {
  const reports = [
    { _id: 'old-full', title: '体检报告', checkDate: '2026-03-20', audit_status: 'audited', examConclusion: '总检结论' },
    { _id: 'recent-partial', title: '体检报告', checkDate: '2026-10-13', audit_status: 'audited', reportItems: [{ name: '肌酐' }, { name: '血糖' }] },
  ];
  const result = eligibility(reports, new Date('2026-11-21T00:00:00+08:00'), { lookbackMonths: 3 });
  assert.equal(result.allowed, false);
  assert.equal(result.problemReportId, 'recent-partial');
  assert.match(result.message, /2026-10-13.*未达到完整体检判定条件/);
  assert.match(result.message, /2026-03-20.*2026-08-21/);
  const checklist = buildAnnualPlanPreparationChecklist({ recentCheckup: result });
  assert.equal(checklist.items.find(item => item.key === 'complete_checkup').reportId, 'recent-partial');
});
