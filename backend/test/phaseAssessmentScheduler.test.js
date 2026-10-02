const test = require('node:test');
const assert = require('node:assert/strict');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const Generation = require('../src/models/PhaseAssessmentGeneration');
const ai = require('../src/utils/ai');
const context = require('../src/utils/aiCaseReviewContext');
let calls = 0, days;
ai.chat = async () => { calls++; return '阶段评估草稿'; };
context.buildStageAssessmentContext = async (user, windowDays) => { days = windowDays; return { sources: [] }; };
const { createAssessment } = require('../src/utils/phaseAssessmentScheduler');
const input = () => ({ plan: { _id: 'plan', confirmedAt: '2025-01-01' }, user: { _id: 'user', assignedFamilyDoctor: 'advisor', assignedRehabSpecialist: 'exercise' }, template: { _id: 'template', content: { frequency: 'quarterly' } }, periodOverride: { key: '2026-Q3', label: '2026第三季度' } });
test.beforeEach(t => {
  t.mock.method(Generation, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Generation, 'exists', async () => true);
  t.mock.method(Generation, 'updateOne', async () => ({}));
});
test('综合评估默认顾问审核并使用季度资料窗口', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment(input());
  assert.equal(row.primaryReviewRole, 'familyDoctor'); assert.equal(row.status, 'doctor_review');
  assert.equal(row.periodKey, '2026-Q3:comprehensive'); assert.equal(days, 90); assert.equal(calls, 1);
});
test('历史周期及同领域周期去重发生在AI调用之前', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async filter => {
    assert.deepEqual(filter.periodKey.$in, ['2026-Q3:comprehensive', '2026-Q3']); return true;
  });
  assert.equal(await createAssessment(input()), null); assert.equal(calls, 0);
});
test('缺少对应专业人员阻止生成，不消耗AI调用', async () => {
  calls = 0;
  await assert.rejects(createAssessment({ ...input(), assessmentDomain: 'tcm' }), /请先分配/);
  assert.equal(calls, 0);
});
test('运动评估使用运动岗位，不改变营养旧流程', async t => {
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment({ ...input(), assessmentDomain: 'exercise' });
  assert.equal(row.primaryReviewRole, 'rehabSpecialist'); assert.equal(row.status, 'professional_review');
});
test('另一进程已占用本周期时不再调用AI', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(Generation, 'findOneAndUpdate', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  assert.equal(await createAssessment(input()), null);
  assert.equal(calls, 0);
});
test('生成失败记录状态以供下次安全重试', async t => {
  const writes = [];
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async () => { throw new Error('temporary write failure'); });
  t.mock.method(Generation, 'updateOne', async (...args) => { writes.push(args); });
  await assert.rejects(createAssessment(input()), /temporary write failure/);
  assert.equal(writes.at(-1)[1].$set.status, 'failed');
});
