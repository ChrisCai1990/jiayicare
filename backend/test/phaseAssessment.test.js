const test = require('node:test');
const assert = require('node:assert/strict');
const { toStructuredAssessment, assessmentToPlainText, quarterPeriod, toTemplateSections, templateAssessmentFromContent, detectClinicalReview, nextAssessmentStatus } = require('../src/utils/phaseAssessment');

test('阶段性评估会去除 Markdown 并归入固定栏目', () => {
  const value = toStructuredAssessment(`### 核心结论\n**血压总体稳定**\n---\n### 重点风险\n- LDL-C 仍需复核\n### 下一步行动\n1. 每日晨间测量血压`, '阶段性评估');
  assert.deepEqual(value.summary, ['血压总体稳定']);
  assert.deepEqual(value.risks, ['LDL-C 仍需复核']);
  assert.deepEqual(value.actions, ['每日晨间测量血压']);
  assert.equal(assessmentToPlainText(value).includes('**'), false);
  assert.equal(assessmentToPlainText(value).includes('###'), false);
});

test('阶段性评估限制每栏条数并去重', () => {
  const rows = ['下一步行动', ...Array.from({ length: 10 }, (_, index) => `- 行动${index}`), '- 行动0'].join('\n');
  const value = toStructuredAssessment(rows);
  assert.equal(value.actions.length, 8);
  assert.equal(new Set(value.actions).size, value.actions.length);
});

test('客户版阶段性评估带年份季度并严格使用模板四栏', () => {
  const period = quarterPeriod(new Date('2026-08-25T00:00:00Z'));
  const template = { _id: 'template-1', name: '季度评估模板', content: { outputSections: ['目标证据', '执行成效', '风险缺口', '下季计划'] } };
  const value = toTemplateSections({ summary: ['总体稳定'], facts: ['血压有记录'], changes: ['依从性改善'], risks: ['血脂待复核'], missing: ['缺少病史'], actions: ['下季度复查'] }, template, period);
  assert.equal(value.periodLabel, '2026年第3季度');
  assert.deepEqual(value.sections.map(item => item.title), template.content.outputSections);
  assert.deepEqual(value.sections[2].items, ['血脂待复核', '缺少病史']);
  assert.equal(value.customerPushEligible, true);
});

test('未匹配启用模板时客户版禁止推送', () => {
  const value = toTemplateSections({ summary: ['内部结论'] }, null, quarterPeriod(new Date('2026-08-25')));
  assert.equal(value.templateMatched, false);
  assert.equal(value.customerPushEligible, false);
});

test('正式阶段评估保留Admin模板、周期和固定栏目', () => {
  const assessment = {
    periodKey: '2026-Q3', periodLabel: '2026年第3季度', templateId: 'tpl-1',
    templateSnapshot: { name: '季度阶段性健康评估', frequency: 'quarterly', outputSections: ['目标证据', '执行成效', '风险缺口', '下季计划'] },
  };
  const value = templateAssessmentFromContent('一、目标证据\n血压趋势稳定\n二、执行成效\n随访完成', assessment);
  assert.equal(value.templateName, '季度阶段性健康评估');
  assert.equal(value.frequency, 'quarterly');
  assert.equal(value.periodKey, '2026-Q3');
  assert.deepEqual(value.sections[0].items, ['血压趋势稳定']);
  assert.deepEqual(value.sections[1].items, ['随访完成']);
});

test('阶段评估必须先由营养师初审', () => {
  assert.equal(nextAssessmentStatus({ currentStatus: 'nutrition_review', actorRole: 'familyDoctor', action: 'approve' }), null);
  assert.equal(nextAssessmentStatus({ currentStatus: 'nutrition_review', actorRole: 'nutritionist', action: 'approve' }), 'finalized');
});

test('临床问题由营养师初审后转健康顾问复审', () => {
  assert.equal(nextAssessmentStatus({ currentStatus: 'nutrition_review', actorRole: 'nutritionist', action: 'approve', clinicalRequired: true }), 'doctor_review');
  assert.equal(nextAssessmentStatus({ currentStatus: 'doctor_review', actorRole: 'familyDoctor', action: 'approve' }), 'finalized');
  assert.equal(nextAssessmentStatus({ currentStatus: 'doctor_review', actorRole: 'familyDoctor', action: 'return' }), 'nutrition_review');
});

test('确定性规则识别用药和异常生命体征临床复审原因', () => {
  const reasons = detectClinicalReview('本期血压持续升高，同时客户提出调整用药剂量。');
  assert.equal(reasons.includes('生命体征持续或明显异常'), true);
  assert.equal(reasons.includes('用药或不良反应问题'), true);
});
