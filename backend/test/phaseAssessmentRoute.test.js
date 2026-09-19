const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const User = require('../src/models/User');
const PhaseAssessment = require('../src/models/PhaseAssessment');
const ServiceRecord = require('../src/models/ServiceRecord');
const AnnualPlan = require('../src/models/AnnualPlan');
const PlanTemplate = require('../src/models/PlanTemplate');
let aiCalls = 0;
require('../src/utils/ai').chat = async () => { aiCalls++; return '年度总评草稿'; };
require('../src/utils/aiCaseReviewContext').buildStageAssessmentContext = async () => ({ sources: [] });
const ids = { patient: '000000000000000000000001', reviewer: '000000000000000000000002', assessment: '000000000000000000000003' };
let actor;
const auth = require.resolve('../src/middleware/staffAuth'); require(auth);
require.cache[auth].exports = (req, res, next) => { req.staff = actor; next(); };
const router = require('../src/routes/aiCaseReviews');
const periodic = require('../src/utils/annualPeriodicGate');
const actualPeriodicGate = periodic.annualPeriodicGate;
test.beforeEach(t => {
  aiCalls = 0;
  t.mock.method(periodic, 'annualPeriodicGate', async plan => ({ allowed: true, anchor: plan.confirmedAt }));
});
async function request(t, body, method = 'PATCH') {
  const app = express(); app.use(express.json()); app.use(router);
  const server = await new Promise(resolve => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const suffix = method === 'GET' ? `?assessmentId=${ids.assessment}` : method === 'POST' ? '/generate' : `/${ids.assessment}`;
  const res = await fetch(`http://127.0.0.1:${server.address().port}/patients/${ids.patient}/phase-assessments${suffix}`, { method, headers: { 'Content-Type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: await res.json() };
}
function setup(t, role = 'rehabSpecialist', patch = {}) {
  actor = { _id: ids.reviewer, role };
  const fields = { rehabSpecialist: 'assignedRehabSpecialist', familyDoctor: 'assignedFamilyDoctor', nutritionist: 'assignedNutritionist' };
  const row = { _id: ids.assessment, patientId: ids.patient, __v: 0, primaryReviewRole: role, status: role === 'familyDoctor' ? 'doctor_review' : 'professional_review', content: '作息较规律', auditLog: [], save: async () => {}, ...patch };
  t.mock.method(User, 'findById', async () => ({ _id: ids.patient, [fields[role]]: ids.reviewer, aiPilotFeatures: { stageAssessment: true } }));
  t.mock.method(PhaseAssessment, 'findOne', async () => row);
  t.mock.method(PhaseAssessment, 'findOneAndUpdate', async (filter, update) => {
    if (filter.status !== row.status) return null;
    Object.assign(row, update.$set); row.__v += update.$inc?.__v || 0;
    if (update.$push?.auditLog) row.auditLog.push(update.$push.auditLog);
    return row;
  });
  return row;
}
test('修改后的风险内容触发顾问审核，不提前归档', async t => {
  const row = setup(t);
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async () => assert.fail('不应归档'));
  const res = await request(t, { action: 'approve', revision: 0, content: '血压持续升高，需要就医' });
  assert.equal(res.status, 200); assert.equal(row.status, 'doctor_review'); assert.equal(row.professionalReview.status, 'escalated');
});
test('过期版本及非当前审核岗位不能提交', async t => {
  setup(t);
  assert.equal((await request(t, { action: 'approve', revision: 2 })).status, 409);
  actor.role = 'nutritionist';
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 403);
});
test('未绑定客户不能查看或修改评估', async t => {
  setup(t); actor._id = '000000000000000000000009';
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 403);
});
test('综合评估由顾问直接确认归档', async t => {
  const row = setup(t, 'familyDoctor'); let archives = 0;
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async () => { archives++; return { _id: 'archive' }; });
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 200);
  assert.equal(row.status, 'finalized'); assert.equal(archives, 1);
});
test('顾问退回运动评估仍回到运动岗位', async t => {
  const row = setup(t, 'familyDoctor', { primaryReviewRole: 'rehabSpecialist' });
  assert.equal((await request(t, { action: 'return', revision: 0, reviewNote: '补充依据' })).status, 200);
  assert.equal(row.status, 'professional_review');
});

test('归档失败保留原审核快照与待办，重试忽略传入的内容', async t => {
  const row = setup(t, 'familyDoctor'); let fail = true; let snapshot;
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async (filter, update) => {
    if (fail) throw new Error('模拟数据库写入失败');
    snapshot = update.$setOnInsert; return { _id: 'archive' };
  });
  const first = await request(t, { action: 'approve', revision: 0, content: '已审核的作息建议' });
  assert.equal(first.status, 202); assert.equal(row.status, 'archive_pending');
  assert.equal(row.finalReviewRole, 'familyDoctor'); assert.equal(row.finalizedBy, ids.reviewer);
  assert.equal((await request(t, { action: 'approve', revision: row.__v, content: '不能替换' })).status, 409);
  fail = false;
  const retry = await request(t, { action: 'retry_archive', content: '不能替换', reviewNote: '不能替换' });
  assert.equal(retry.status, 200); assert.equal(row.status, 'finalized');
  assert.equal(row.content, '已审核的作息建议'); assert.equal(snapshot.staffId, ids.reviewer);
  assert.equal(snapshot.writeback.reviewedBy, ids.reviewer);
});

test('归档重试不能由其他岗位越权执行', async t => {
  setup(t, 'rehabSpecialist', { status: 'archive_pending', finalReviewRole: 'familyDoctor' });
  assert.equal((await request(t, { action: 'retry_archive' })).status, 403);
});
test('工作台链接能读取最近20条以外的评估，且查询限定当前客户', async t => {
  const row = setup(t, 'familyDoctor', { status: 'archive_pending', finalReviewRole: 'familyDoctor' });
  t.mock.method(PhaseAssessment, 'find', () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }));
  t.mock.method(PhaseAssessment, 'findOne', filter => {
    assert.equal(filter.patientId, ids.patient); assert.equal(filter._id, ids.assessment);
    return { lean: async () => row };
  });
  const result = await request(t, null, 'GET');
  assert.equal(result.status, 200); assert.equal(result.body.data[0]._id, ids.assessment);
});
test('年度总评入口仅健康顾问负责，未到第11个月阻断', async t => {
  setup(t, 'nutritionist');
  t.mock.method(AnnualPlan, 'findOne', () => ({ sort: () => ({ lean: async () => ({ _id: 'plan', confirmedAt: new Date() }) }) }));
  assert.equal((await request(t, { frequency: 'yearly' }, 'POST')).status, 403);
  actor.role = 'familyDoctor';
  t.mock.method(User, 'findById', async () => ({ _id: ids.patient, assignedFamilyDoctor: ids.reviewer, aiPilotFeatures: { stageAssessment: true } }));
  assert.equal((await request(t, { frequency: 'yearly' }, 'POST')).status, 409);
});
test('年度总评选择年度模板并固定综合顾问审核，不发布下一年方案', async t => {
  setup(t, 'familyDoctor');
  t.mock.method(AnnualPlan, 'findOne', () => ({ sort: () => ({ lean: async () => ({ _id: 'plan', confirmedAt: '2020-01-01' }) }) }));
  t.mock.method(PlanTemplate, 'findOne', filter => {
    assert.equal(filter['content.frequency'], 'yearly');
    return { sort: () => ({ lean: async () => ({ _id: 'template', content: { frequency: 'yearly' } }) }) };
  });
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async value => value);
  const result = await request(t, { frequency: 'yearly', domain: 'nutrition' }, 'POST');
  assert.equal(result.status, 201); assert.equal(result.body.data.status, 'doctor_review');
  assert.equal(result.body.data.assessmentDomain, 'comprehensive');
  assert.equal(result.body.data.templateSnapshot.windowDays, 365);
  assert.equal(result.body.data.periodKey, 'Y1:comprehensive');
});

function generation(t, patch = {}) {
  setup(t, 'familyDoctor');
  const plan = { _id: 'plan', patientId: ids.patient, confirmedAt: '2020-01-01', ...patch };
  t.mock.method(AnnualPlan, 'findOne', () => ({ sort: () => ({ lean: async () => plan }) }));
  t.mock.method(PlanTemplate, 'findOne', filter => ({ sort: () => ({ lean: async () => ({ _id: 'template', content: { frequency: filter['content.frequency'] } }) }) }));
  t.mock.method(PhaseAssessment, 'exists', async () => false);
  t.mock.method(PhaseAssessment, 'create', async value => value);
  return plan;
}

test('常规、年度总评和强化营养新评估均先核验可信服务期，不通过不调用AI', async t => {
  generation(t);
  t.mock.method(periodic, 'annualPeriodicGate', async () => ({ allowed: false, reason: '当前没有已生效且有效的续约服务期' }));
  t.mock.method(PlanTemplate, 'findOne', () => assert.fail('门槛前不得查模板或启动评估'));
  for (const body of [{}, { frequency: 'yearly' }, { mode: 'intensive_nutrition' }]) {
    const res = await request(t, body, 'POST'); assert.equal(res.status, 409); assert.match(res.body.message, /续约服务期/);
  }
  assert.equal(aiCalls, 0);
});
test('手动年度总评使用有效执行起点，提前确认不能提前进入第11个月', async t => {
  generation(t);
  t.mock.method(periodic, 'annualPeriodicGate', async () => ({ allowed: true, anchor: new Date() }));
  const res = await request(t, { frequency: 'yearly' }, 'POST');
  assert.equal(res.status, 409); assert.match(res.body.message, /有效执行起点/); assert.equal(aiCalls, 0);
});
test('可信续约有效时档案旧到期日不阻断手动评估', async t => {
  generation(t, { continuitySource: { previousPlanId: 'old' } });
  t.mock.method(User, 'findById', async () => ({ _id: ids.patient, assignedFamilyDoctor: ids.reviewer, serviceExpiry: '2020-01-01', aiPilotFeatures: { stageAssessment: true } }));
  t.mock.method(periodic, 'annualPeriodicGate', actualPeriodicGate);
  t.mock.method(require('../src/utils/serviceAccess'), 'resolveServiceAccess', async () => ({ active: true, source: 'verified_renewal' }));
  t.mock.method(require('../src/utils/annualServicePeriod'), 'annualExecutionGate', async () => ({ allowed: true, anchor: '2020-01-01' }));
  assert.equal((await request(t, {}, 'POST')).status, 201); assert.equal(aiCalls, 1);
});
test('旧年度不能借已生效下一年度权益生成新评估，超级管理员也不绕过', async t => {
  generation(t); actor.role = 'superadmin';
  t.mock.method(periodic, 'annualPeriodicGate', actualPeriodicGate);
  t.mock.method(require('../src/utils/serviceAccess'), 'resolveServiceAccess', async () => ({ active: true, source: 'verified_renewal' }));
  const res = await request(t, {}, 'POST'); assert.equal(res.status, 409); assert.match(res.body.message, /旧年度/); assert.equal(aiCalls, 0);
});
test('服务期查询故障不默认放行，不产生AI调用', async t => {
  generation(t);
  t.mock.method(periodic, 'annualPeriodicGate', async () => { throw Error('服务期暂不可核验'); });
  assert.equal((await request(t, {}, 'POST')).status, 500); assert.equal(aiCalls, 0);
});
test('过期后的已有评估仍可审核归档，不因新周期门槛卡住已启动服务', async t => {
  const row = setup(t, 'familyDoctor');
  t.mock.method(periodic, 'annualPeriodicGate', () => assert.fail('已有记录审核不调用新周期门槛'));
  t.mock.method(ServiceRecord, 'findOneAndUpdate', async () => ({ _id: 'archive' }));
  assert.equal((await request(t, { action: 'approve', revision: 0 })).status, 200);
  assert.equal(row.status, 'finalized'); assert.equal(aiCalls, 0);
});
test('未来开始、无效开始和已结束营养方案不被误算为第1周', async t => {
  generation(t);
  const HealthPlan = require('../src/models/HealthPlan');
  for (const dates of [{ startDate: '2999-01-01' }, { startDate: 'bad' }, { startDate: new Date(), endDate: '2020-01-01' }]) {
    t.mock.method(HealthPlan, 'findOne', () => ({ sort: () => ({ lean: async () => ({ _id: 'nutrition', ...dates }) }) }));
    assert.equal((await request(t, { mode: 'intensive_nutrition' }, 'POST')).status, 409);
  }
  assert.equal(aiCalls, 0);
});
test('有效强化营养仍沿用既有周节点、营养岗位和资料窗口', async t => {
  generation(t);
  t.mock.method(User, 'findById', async () => ({ _id: ids.patient, assignedFamilyDoctor: ids.reviewer, assignedNutritionist: 'nutritionist', aiPilotFeatures: { stageAssessment: true } }));
  t.mock.method(require('../src/models/HealthPlan'), 'findOne', () => ({ sort: () => ({ lean: async () => ({ _id: 'nutrition', startDate: new Date(Date.now() - 8 * 86400000) }) }) }));
  const res = await request(t, { mode: 'intensive_nutrition' }, 'POST');
  assert.equal(res.status, 201); assert.equal(res.body.data.interventionWeek, 2);
  assert.equal(res.body.data.primaryReviewRole, 'nutritionist'); assert.equal(res.body.data.templateSnapshot.windowDays, 7); assert.equal(aiCalls, 1);
});
