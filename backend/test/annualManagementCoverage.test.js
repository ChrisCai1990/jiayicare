const test = require('node:test');
const assert = require('node:assert/strict');
const { validatePlanCoverage } = require('../src/utils/annualManagementEvidence');
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
