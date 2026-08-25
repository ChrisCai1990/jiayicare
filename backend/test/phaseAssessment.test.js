const test = require('node:test');
const assert = require('node:assert/strict');
const { toStructuredAssessment, assessmentToPlainText } = require('../src/utils/phaseAssessment');

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
