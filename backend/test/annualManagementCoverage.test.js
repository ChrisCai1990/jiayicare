const test = require('node:test');
const assert = require('node:assert/strict');
const { load, validatePlanCoverage } = require('../src/utils/annualManagementEvidence');
const { buildAnnualPlanDisplayItems, customerModuleData } = require('../src/utils/annualPlanPresentation');

test('顾问选择完善检查后，不能以复查事项代替并推送', () => {
  const evidence = [{ id: 'management_issue:1', content: { problem: '肺结节', direction: 'checkup_completion' } }];
  assert.match(validatePlanCoverage({ abnormal_followup: { records: [{ sourceIds: ['management_issue:1'] }] } }, evidence), /肺结节/);
  assert.equal(validatePlanCoverage({ checkup_completion: { records: [{ sourceIds: ['management_issue:1'] }] } }, evidence), '');
});

test('日常跟进保留在员工方案中，客户方案项目和原始板块均不展示', () => {
  const source = { personalized_followups: { records: [
    { standardPlanName: '日常跟进', executionDate: '2026-11-10' },
    { standardPlanName: '定期复评', executionDate: '2026-11-11' },
  ] } };
  assert.equal(buildAnnualPlanDisplayItems(source).length, 1);
  assert.equal(customerModuleData(source).personalized_followups.records.length, 1);
  assert.equal(source.personalized_followups.records.length, 2);
});

test('多项目报告的旧报告级决定需由顾问重新指定检查项', async () => {
  const updatedAt = new Date('2026-10-20T00:00:00Z');
  const decisions = [{ _id: 'decision', title: '脂肪肝', reportId: 'report', sourceKey: 'screening_report:report',
    sourceSnapshot: { reportUpdatedAt: updatedAt } }];
  const report = { _id: 'report', updatedAt, reportItems: [
    { screeningKey: 'liver', diagnosis: '脂肪肝' }, { screeningKey: 'kidney', diagnosis: '双肾未见异常' },
  ] };
  const Decision = { find: () => ({ sort: () => ({ lean: async () => decisions }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => report }) }) };
  const result = await load('patient', 2026, { Decision, Report });
  assert.equal(result.evidence.length, 0);
  assert.match(result.stale[0], /重新归属/);
});
