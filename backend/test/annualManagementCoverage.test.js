const test = require('node:test');
const assert = require('node:assert/strict');
const { load, validatePlanCoverage, effectiveDecisions } = require('../src/utils/annualManagementEvidence');
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
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [] }) };
  const result = await load('patient', 2026, { Decision, Report, User, CheckupReview });
  assert.equal(result.evidence.length, 0);
  assert.match(result.stale[0], /重新归属/);
  assert.deepEqual(result.staleDecisionIds, ['decision']);
});

test('撤销旧版归属后不再阻止年度方案生成', async () => {
  let selector;
  const Decision = { find: query => { selector = query; return { sort: () => ({ lean: async () => [] }) }; } };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const result = await load('patient', 2026, { Decision, User });
  assert.deepEqual(selector.status, { $ne: 'withdrawn' });
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.staleDecisionIds, []);
});

test('同报告同问题同方向已归到检查项时，旧整份报告归属自动让位', async () => {
  const updatedAt = new Date('2026-10-20T00:00:00Z');
  const legacy = { _id: 'legacy', title: '脂肪肝', direction: 'ongoing_management', reportId: 'report',
    sourceKey: 'screening_report:report', sourceSnapshot: { reportUpdatedAt: updatedAt } };
  const current = { _id: 'item', title: '脂肪肝', direction: 'ongoing_management', reportId: 'report', itemId: 'liver-ultrasound',
    sourceKey: 'screening:report:liver-ultrasound', sourceSnapshot: { reportUpdatedAt: updatedAt, item: { name: '肝脏超声' } } };
  assert.deepEqual(effectiveDecisions([legacy, current]).map(row => row._id), ['item']);
  assert.equal(effectiveDecisions([legacy, { ...current, title: '肾结晶' }]).length, 2);
  assert.equal(effectiveDecisions([legacy, { ...current, direction: 'abnormal_followup' }]).length, 2);
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [legacy, current] }) }) };
  const Report = { findOne: () => ({ select: () => ({ lean: async () => ({ _id: 'report', title: '体检报告', updatedAt, reportItems: [
    { screeningKey: 'liver', name: '肝脏超声' }, { screeningKey: 'kidney', name: '肾脏超声' },
  ] }) }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }) };
  const result = await load('patient', 2026, { Decision, Report, User });
  assert.deepEqual(result.stale, []);
  assert.deepEqual(result.evidence.map(row => row.id), ['management_issue:item']);
});

test('已审核 AI 缺口必须逐项处理，确需检查进入完善检查且不能被复查替代', async () => {
  const summary = { byYear: { 2026: { records: [{ scope: 'doctor', generatedAt: '2026-10-24',
    sections: { checkup_completeness: { missing: ['补做肾脏超声', '补传已做的肺部CT'] } },
    sectionReviews: { checkup_completeness: { status: 'approved', approvedAt: '2026-10-24T04:00:00Z' } },
  }] } } };
  const { approvedItems } = require('../src/utils/aiHealthCheckupItems');
  const [exam, records] = approvedItems(summary, 2026).items;
  const Decision = { find: () => ({ sort: () => ({ lean: async () => [] }) }) };
  const User = { findById: () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: summary }) }) }) };
  const CheckupReview = { find: () => ({ lean: async () => [
    { _id: 'ai1', sourceKey: exam.sourceKey, itemText: exam.text, disposition: 'needs_exam', title: '肾脏超声', note: '核对后需检查' },
    { _id: 'ai2', sourceKey: records.sourceKey, itemText: records.text, disposition: 'request_records', note: '检查已完成，补传报告' },
  ] }) };
  const result = await load('patient', 2026, { Decision, User, CheckupReview });
  assert.deepEqual(result.unresolved, []);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].content.direction, 'checkup_completion');
  assert.match(validatePlanCoverage({ abnormal_followup: { records: [{ sourceIds: [result.evidence[0].id] }] } }, result.evidence), /肾脏超声/);
  assert.equal(validatePlanCoverage({ checkup_completion: { records: [{ sourceIds: [result.evidence[0].id] }] } }, result.evidence), '');
  const newSummary = structuredClone(summary);
  newSummary.byYear[2026].records[0].sections.checkup_completeness.missing.push('补做心脏超声');
  const next = approvedItems(newSummary, 2026);
  assert.notEqual(next.version, approvedItems(summary, 2026).version);
});
