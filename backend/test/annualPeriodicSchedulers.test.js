const test = require('node:test');
const assert = require('node:assert/strict');
const AnnualPlan = require('../src/models/AnnualPlan');
const User = require('../src/models/User');
const Template = require('../src/models/PlanTemplate');
const Assessment = require('../src/models/PhaseAssessment');
const Supply = require('../src/models/RecurringSupplyPlan');
const Message = require('../src/models/Message');
const gate = require('../src/utils/annualPeriodicGate');
const packageFeatures = require('../src/utils/packageFeatureEntitlements');
const ai = require('../src/utils/ai');
const context = require('../src/utils/aiCaseReviewContext');
let aiCalls = 0, saved = [];
ai.chat = async () => { aiCalls++; return '待审核草稿'; };
context.buildStageAssessmentContext = async () => ({ sources: [] });
require('../src/utils/supplyWorkflowConfig').getSupplyWorkflowConfig = async () => ({ medication: { enabled: true, leadDays: 3 }, supplement: { enabled: true, leadDays: 3 }, customerNotificationEnabled: true });
const { scanAndCreatePhaseAssessments, eligibleForAutomaticAssessment, completedCalendarPeriod } = require('../src/utils/phaseAssessmentScheduler');
const { scanAndNotifyDueSupplyPlans } = require('../src/utils/recurringSupplyPlanScheduler');
const user = { _id: 'u', assignedFamilyDoctor: 'doctor', aiPilotFeatures: { stageAssessment: true }, serviceExpiry: '2020-01-01' };
const plan = { _id: 'p', patientId: 'u', confirmedAt: '2020-01-01', continuitySource: { previousPlanId: 'old' } };
test.beforeEach(t => {
  t.mock.method(packageFeatures, 'getAiEntitlements', async () => ({ phaseAssessment: true, phaseAssessmentFrequency: 'quarterly' }));
  aiCalls = 0; saved = [];
  const previousKey = process.env.QWEN_API_KEY;
  process.env.QWEN_API_KEY = 'test-only-not-a-real-key';
  t.after(() => { if (previousKey === undefined) delete process.env.QWEN_API_KEY; else process.env.QWEN_API_KEY = previousKey; });
  t.mock.method(AnnualPlan, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [plan] }) }) }));
  t.mock.method(Template, 'find', () => ({ lean: async () => [{ _id: 't', content: { frequency: 'quarterly' } }] }));
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  t.mock.method(Assessment, 'exists', async () => saved.length > 0);
  t.mock.method(Assessment, 'create', async row => { saved.push(row); return row; });
  t.mock.method(gate, 'annualPeriodicGate', async () => ({ allowed: true, anchor: new Date('2019-01-01'), access: { active: true, endDate: '2099-01-01' } }));
});
test('月度自动评估只生成刚结束的月份，已被替代的八月旧稿不影响九月', () => {
  const period = completedCalendarPeriod('monthly', new Date('2026-10-02T02:00:00Z'), new Date('2026-09-22T17:49:42Z'));
  assert.equal(period.key, '2026-09');
  assert.equal(period.label, '2026年9月');
  assert.equal(period.start.toISOString(), '2026-09-22T17:49:42.000Z');
  assert.equal(period.end.toISOString(), '2026-09-30T15:59:59.999Z');
  assert.equal(completedCalendarPeriod('monthly', new Date('2026-10-02T02:00:00Z'), new Date('2026-10-01')), null);
});
test('显式试点客户沿用已启用的月度模板，生成营养师待审九月评估', async t => {
  t.mock.method(packageFeatures, 'getAiEntitlements', async () => ({ phaseAssessment: true, phaseAssessmentFrequency: '' }));
  t.mock.method(Template, 'find', () => ({ lean: async () => [{ _id: 't', clientBrand: 'jinyisen', content: { frequency: 'monthly' } }] }));
  t.mock.method(User, 'findById', () => ({ select: async () => ({ ...user, clientBrand: 'jinyisen', assignedNutritionist: 'nutritionist' }) }));
  assert.equal(await scanAndCreatePhaseAssessments(), 1);
  assert.equal(saved[0].periodKey.endsWith(':nutrition'), true);
  assert.equal(saved[0].primaryReviewRole, 'nutritionist');
  assert.equal(saved[0].status, 'nutrition_review');
  assert.equal(aiCalls, 1);
});
test('续约客户旧档案过期仍可生成待审评估，重复扫描不再次调用AI', async () => {
  assert.equal(await scanAndCreatePhaseAssessments(), 1);
  assert.equal(await scanAndCreatePhaseAssessments(), 0);
  assert.equal(aiCalls, 1); assert.equal(saved[0].status, 'doctor_review');
});
test('续年总评从有效执行起点计算，不从提前确认日提前触发', async t => {
  t.mock.method(Template, 'find', () => ({ lean: async () => [{ _id: 't', content: { frequency: 'yearly' } }] }));
  assert.equal(await scanAndCreatePhaseAssessments(), 0); assert.equal(aiCalls, 0);
});
test('门槛不通过、非试点和缺失客户都不调用AI', async t => {
  t.mock.method(gate, 'annualPeriodicGate', async () => ({ allowed: false }));
  assert.equal(await scanAndCreatePhaseAssessments(), 0);
  for (const row of [null, { ...user, aiPilotFeatures: {} }, { ...user, isDeleted: true }]) {
    t.mock.method(User, 'findById', () => ({ select: async () => row }));
    assert.equal(await scanAndCreatePhaseAssessments(), 0);
  }
  assert.equal(aiCalls, 0);
});
test('单个客户凭据故障不阻断下一个客户', async t => {
  t.mock.method(AnnualPlan, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [plan, { ...plan, _id: 'p2', patientId: 'u2' }] }) }) }));
  t.mock.method(gate, 'annualPeriodicGate', async row => {
    if (row.patientId === 'u') throw Error('temporary failure');
    return { allowed: true, anchor: new Date('2019-01-01'), access: { active: true, endDate: '2099-01-01' } };
  });
  assert.equal(await scanAndCreatePhaseAssessments(), 1); assert.equal(aiCalls, 1);
});
test('评估资格优先可信窗口且仍要求结束日期，旧期未开始不得生成', () => {
  assert.equal(eligibleForAutomaticAssessment(user, new Date(), { active: true, endDate: '2099-01-01' }), true);
  for (const access of [{ active: false, endDate: '2099-01-01' }, { active: true, endDate: '' }]) assert.equal(eligibleForAutomaticAssessment(user, new Date(), access), false);
  assert.equal(eligibleForAutomaticAssessment({ ...user, serviceStartDate: '2098-01-01', serviceExpiry: '2099-01-01' }), false);
});
function supply(id, workflowStatus = 'idle', aiStatus = null) {
  return { _id: id, sourceAnnualPlanId: 'p', patientId: user, planType: 'medication', itemName: id, nextDueDate: new Date(), workflowStatus, aiStatus, saves: 0, async save() { this.saves++; } };
}
test('年度补给暂停新周期，不更改已进行/人工暂停状态；故障不阻断其他计划', async t => {
  const rows = [supply('blocked'), supply('error'), supply('running', 'fulfillment_pending'), supply('paused', 'paused'), supply('good')];
  const checked = [], messages = [];
  t.mock.method(Supply, 'find', () => ({ populate: async () => rows }));
  t.mock.method(gate, 'canStartAnnualSupplyCycle', async row => { checked.push(row._id); if (row._id === 'error') throw Error('database failure'); return row._id === 'good'; });
  t.mock.method(Message, 'create', async row => messages.push(row));
  await scanAndNotifyDueSupplyPlans(); await scanAndNotifyDueSupplyPlans();
  for (const row of rows.slice(0, 4)) assert.equal(row.saves, 0);
  assert.equal(rows[4].saves, 1); assert.equal(messages.length, 1);
  assert.equal(checked.includes('paused'), false); assert.equal(checked.includes('running'), false);
});
test('旧版已派待办仍可升级履约流程，不因到期丢失', async t => {
  const row = supply('legacy', 'idle', 'pending');
  t.mock.method(Supply, 'find', () => ({ populate: async () => [row] }));
  t.mock.method(gate, 'canStartAnnualSupplyCycle', async () => { throw Error('must not check existing work'); });
  await scanAndNotifyDueSupplyPlans();
  assert.equal(row.workflowStatus, 'intake_pending'); assert.equal(row.saves, 1);
});
