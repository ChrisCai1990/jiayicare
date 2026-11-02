const test = require('node:test');
const assert = require('node:assert/strict');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const Generation = require('../src/models/PhaseAssessmentGeneration');
const ai = require('../src/utils/ai');
const context = require('../src/utils/aiCaseReviewContext');
let calls = 0, days, requestedMaxTokens, requestedPrompt;
ai.chat = async (messages, options) => { calls++; requestedMaxTokens = options.maxTokens; requestedPrompt = messages[0].content; return '阶段评估草稿'; };
context.buildStageAssessmentContext = async (user, windowDays) => { days = windowDays; return { sources: ['已确认年度管理方案'], confirmedAnnualPlan: { notes: 'PLAN_ONLY_TEST' } }; };
const { createAssessment, scanAndCreatePhaseAssessments } = require('../src/utils/phaseAssessmentScheduler');
const input = () => ({ plan: { _id: 'plan', confirmedAt: '2025-01-01' }, user: { _id: 'user', membershipTier: 'annual', assignedFamilyDoctor: 'advisor', assignedNutritionist: 'nutritionist', assignedRehabSpecialist: 'exercise' }, template: { _id: 'template', content: { frequency: 'quarterly' } }, periodOverride: { key: '2026-Q3', label: '2026第三季度' } });
test.beforeEach(t => {
  t.mock.method(Generation, 'findOneAndUpdate', async () => ({}));
  t.mock.method(Generation, 'exists', async () => true);
  t.mock.method(Generation, 'updateOne', async () => ({}));
});
test('常规综合评估生成营养师和顾问关联待办并使用季度资料窗口', async t => {
  calls = 0;
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment(input());
  assert.equal(row.primaryReviewRole, 'familyDoctor'); assert.equal(row.status, 'team_review');
  assert.equal(row.reviewWorkflow, 'advisor_nutrition');
  assert.deepEqual(row.teamRoles, ['nutritionist', 'familyDoctor']);
  assert.equal(row.periodKey, '2026-Q3'); assert.equal(days, 90); assert.equal(calls, 1);
  assert.ok(requestedMaxTokens >= 3000);
  assert.match(requestedPrompt, /现有记录无法分析两者关联/);
  assert.match(requestedPrompt, /记录日期少不等于没有执行/);
  assert.match(requestedPrompt, /不得从一次饮食描述推断整月膳食结构发生变化/);
  assert.match(requestedPrompt, /暂无增加记录的必要/);
  assert.match(requestedPrompt, /不能仅凭零散数据推断客户存在误区/);
  assert.match(requestedPrompt, /补充记录建议须经营养师或健康顾问确认/);
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
test('缺少健康顾问不生成阶段性评估', async () => {
  calls = 0;
  await assert.rejects(createAssessment({ ...input(), user: { ...input().user, assignedFamilyDoctor: null } }), /健康顾问/);
  assert.equal(calls, 0);
});
test('常规综合复盘未分配营养师时不调用AI', async () => {
  calls = 0;
  await assert.rejects(createAssessment({ ...input(), user: { ...input().user, assignedNutritionist: null } }), /营养师/);
  assert.equal(calls, 0);
});
test('已有评估权益的存量会员无需档案分层也能生成顾问督办和营养师待办', async t => {
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment({ ...input(), user: { ...input().user, membershipTier: undefined } });
  assert.equal(row.reviewWorkflow, 'advisor_nutrition');
  assert.deepEqual(row.teamRoles, ['nutritionist', 'familyDoctor']);
});
test('月度综合评估不依赖年度方案，按客户和月份去重', async t => {
  t.mock.method(PhaseAssessment, 'exists', async filter => {
    assert.equal(filter.patientId, 'user');
    assert.equal(filter.annualPlanId, undefined);
    return false;
  });
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment({ ...input(), plan: null, template: { _id: 'template', content: { frequency: 'monthly' } }, periodOverride: { key: '2026-10', label: '2026年10月' } });
  assert.equal(row.annualPlanId, null);
  assert.equal(row.reviewWorkflow, 'advisor_nutrition');
  assert.deepEqual(row.teamRoles, ['nutritionist', 'familyDoctor']);
  assert.match(requestedPrompt, /独立月度复盘/);
  assert.match(requestedPrompt, /就医次数/);
  assert.doesNotMatch(requestedPrompt, /PLAN_ONLY_TEST/);
});
test('自动月度扫描直接遍历有效客户，无需已确认年度方案', async t => {
  const User = require('../src/models/User');
  const PlanTemplate = require('../src/models/PlanTemplate');
  const AnnualPlan = require('../src/models/AnnualPlan');
  const access = require('../src/utils/serviceAccess');
  const rights = require('../src/utils/packageFeatureEntitlements');
  const oldKey = process.env.QWEN_API_KEY, oldScope = process.env.PHASE_ASSESSMENT_AUTO_SCOPE;
  process.env.QWEN_API_KEY = 'synthetic'; process.env.PHASE_ASSESSMENT_AUTO_SCOPE = 'eligible';
  t.after(() => { if (oldKey === undefined) delete process.env.QWEN_API_KEY; else process.env.QWEN_API_KEY = oldKey; if (oldScope === undefined) delete process.env.PHASE_ASSESSMENT_AUTO_SCOPE; else process.env.PHASE_ASSESSMENT_AUTO_SCOPE = oldScope; });
  t.mock.method(AnnualPlan, 'find', () => assert.fail('月度扫描不应查询年度方案'));
  t.mock.method(User, 'find', () => ({ select: () => ({ limit: async () => [input().user] }) }));
  t.mock.method(PlanTemplate, 'find', () => ({ lean: async () => [{ _id: 'template', content: { frequency: 'monthly' } }] }));
  t.mock.method(access, 'resolveServiceAccess', async () => ({ active: true, startDate: '2020-01-01', endDate: '2030-01-01' }));
  t.mock.method(rights, 'getAiEntitlements', async () => ({ phaseAssessment: true }));
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  assert.equal(await scanAndCreatePhaseAssessments(), 1);
});
test('运动专项评估只进入对应专业岗位', async t => {
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async row => row);
  const row = await createAssessment({ ...input(), assessmentDomain: 'exercise' });
  assert.equal(row.primaryReviewRole, 'rehabSpecialist'); assert.equal(row.status, 'team_review');
  assert.deepEqual(row.teamRoles, ['rehabSpecialist']);
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
