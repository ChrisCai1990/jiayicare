const test = require('node:test');
const assert = require('node:assert/strict');
const { isWithinLeadWindow, parseAiJson, REVIEW_ROLE } = require('../src/utils/supplyWorkflow');

test('药品和营养素均至少提前3天进入补充流程', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  assert.equal(isWithinLeadWindow({ nextDueDate: new Date('2026-09-10T00:00:00.000Z'), leadDays: 3 }, now), true);
  assert.equal(isWithinLeadWindow({ nextDueDate: new Date('2026-09-11T00:00:00.000Z'), leadDays: 3 }, now), false);
  assert.equal(isWithinLeadWindow({ nextDueDate: new Date('2026-09-10T00:00:00.000Z'), leadDays: 1 }, now), true);
});

test('药品由健康顾问角色审核，营养素由营养师审核', () => {
  assert.equal(REVIEW_ROLE.medication, 'familyDoctor');
  assert.equal(REVIEW_ROLE.supplement, 'nutritionist');
});

test('可解析带代码围栏的AI JSON草稿', () => {
  assert.deepEqual(parseAiJson('```json\n{"summary":"草稿"}\n```'), { summary: '草稿' });
});
