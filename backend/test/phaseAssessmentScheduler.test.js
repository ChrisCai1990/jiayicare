const test = require('node:test');
const assert = require('node:assert/strict');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const Generation = require('../src/models/PhaseAssessmentGeneration');
const ai = require('../src/utils/ai');
const context = require('../src/utils/aiCaseReviewContext');
let calls = 0, days, requestedMaxTokens;
ai.chat = async (_messages, options) => { calls++; requestedMaxTokens = options.maxTokens; return '阶段评估草稿'; };
context.buildStageAssessmentContext = async (user, windowDays) => { days = windowDays; return { sources: [] }; };
const { createAssessment } = require('../src/utils/phaseAssessmentScheduler');
const input = () => ({ plan: { _id: 'plan', confirmedAt: '2025-01-01' }, user: { _id: 'user', membershipTier: 'annual', assignedFamilyDoctor: 'advisor', assignedRehabSpecialist: 'exercise' }, template: { _id: 'template', content: { frequency: 'quarterly' } }, periodOverride: { key: '2026-Q3', label: '2026第三季度' } });
test.beforeEach(t => {
  t.mock.method(Generation, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Generation, 'exists', async () => true);
  t.mock.method(Generation, 'updateOne', async () => ({}));
});
test('常规综合评估生成一条团队复盘并使用季度资料窗口', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment(input());
  assert.equal(row.primaryReviewRole, 'familyDoctor'); assert.equal(row.status, 'team_review');
  assert.deepEqual(row.teamRoles, ['familyDoctor']);
  assert.equal(row.periodKey, '2026-Q3'); assert.equal(days, 90); assert.equal(calls, 1);
  assert.ok(requestedMaxTokens >= 3000);
});
test('历史周期及同领域周期去重发生在AI调用之前', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async filter => {
    assert.equal(filter.periodKey.$regex, '^2026-Q3(?::|$)');
    assert.equal(filter.templateId, undefined);
    return true;
  });
  assert.equal(await createAssessment(input()), null); assert.equal(calls, 0);
});
test('缺少对应专业人员阻止生成，不消耗AI调用', async () => {
  calls = 0;
  await assert.rejects(createAssessment({ ...input(), assessmentDomain: 'tcm' }), /请先分配/);
  assert.equal(calls, 0);
});
test('非年度会员或未分配健康顾问不生成阶段性评估', async () => {
  calls = 0;
  await assert.rejects(createAssessment({ ...input(), user: { ...input().user, membershipTier: 'single' } }), /年度会员/);
  await assert.rejects(createAssessment({ ...input(), user: { ...input().user, assignedFamilyDoctor: null } }), /健康顾问/);
  assert.equal(calls, 0);
});
test('运动来源的常规评估仍由实际服务团队核对', async t => {
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment({ ...input(), assessmentDomain: 'exercise' });
  assert.equal(row.primaryReviewRole, 'rehabSpecialist'); assert.equal(row.status, 'team_review');
  assert.deepEqual(row.teamRoles, ['rehabSpecialist', 'familyDoctor']);
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
