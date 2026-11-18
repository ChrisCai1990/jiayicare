const test = require('node:test');
const assert = require('node:assert/strict');
const { load, project, stepLink, steps } = require('../src/utils/annualManagementWorkflow');
const pilot = require('../src/utils/annualFlowPilot');
const router = require('../src/routes/staff');
const workflow = require('../src/utils/annualManagementWorkflow');
const AnnualPlanPreparation = require('../src/models/AnnualPlanPreparation');
const User = require('../src/models/User');

const now = new Date('2026-11-17T04:00:00Z');
const patient = { _id: 'p1', name: '测试客户', serviceStartDate: '2026-06-01' };
const report = { _id: 'r1', user: 'p1', title: '年度体检报告', audit_status: 'audited', status: 'pending',
  documentCategory: 'physical_exam', checkDate: '2026-10-01', examConclusion: '完整体检结论', updatedAt: now };

test('工作台一张主卡指向准确步骤，七个步骤都有可直达的办理位置', () => {
  const flow = project(patient, 2026, [], [report], now);
  assert.equal(flow.type, 'annual_workflow');
  assert.equal(flow.step, 'interpretation');
  assert.equal(flow.steps.length, 7);
  assert.equal(flow.steps.find(row => row.key === 'interpretation').link,
    '/patients/p1?tab=reports&workflowStep=interpretation#annual-report-interpretation');
  assert.equal(flow.steps.find(row => row.key === 'screening').link,
    '/patients/p1?tab=ai&workflowStep=screening#screening-results');
  assert.equal(flow.steps.find(row => row.key === 'goals').link,
    '/patients/p1/annual-health?year=2026#annual-management-goals');
  assert.equal(flow.steps.find(row => row.key === 'assessment').link,
    '/patients/p1?tab=aiReview&workflowStep=assessment#annual-workflow-assessment');
  for (const step of steps) assert.ok(stepLink('p1', 2026, step).startsWith('/patients/p1'));
  const interpreted = { ...report, advisorInterpretationConfirmedAt: now };
  assert.equal(project(patient, 2026, [], [interpreted], now).step, 'screening');
  assert.equal(project(patient, 2026, [], [interpreted], now, [{ patientId: 'p1', year: 2026,
    screeningConfirmedAt: new Date('2026-11-17T05:00:00Z') }]).step, 'goals');
  assert.equal(project(patient, 2026, [], [{ ...interpreted, updatedAt: new Date('2026-11-17T06:00:00Z') }], now,
    [{ patientId: 'p1', year: 2026, screeningConfirmedAt: new Date('2026-11-17T05:00:00Z') }]).step, 'screening');
});

test('已有确认方案保留原件；新报告先解读，之后进入目标或执行', t => {
  t.mock.method(pilot, 'enabled', () => true);
  const plan = { _id: 'plan1', patientId: 'p1', year: 2026, confirmedAt: now, pushedAt: now,
    moduleData: { management_targets: { records: [] } } };
  assert.equal(project(patient, 2026, [plan], [report], now).step, 'interpretation');
  const interpreted = { ...report, advisorInterpretationConfirmedAt: now };
  assert.equal(project(patient, 2026, [plan], [interpreted], now).step, 'goals');
  plan.moduleData.management_targets.records.push({ goal: '复核体重变化' });
  const execution = project(patient, 2026, [plan], [interpreted], now);
  assert.equal(execution.step, 'execution');
  assert.equal(execution.overdue, false);
  assert.equal(execution.planId, 'plan1');
});

test('已分析但未获顾问确认的报告仍在解读步骤，退回修改的报告暂不重复待确认', () => {
  const analyzed = { ...report, status: 'analyzed' };
  assert.equal(project(patient, 2026, [], [analyzed], now).step, 'interpretation');
  assert.equal(project(patient, 2026, [], [{ ...analyzed, advisorCorrection: { status: 'returned' } }], now).step, 'preparation');
});
test('确认方案已有标准事项目标时不再提示年度目标待确认', t => {
  t.mock.method(pilot, 'enabled', () => true);
  const plan = { _id: 'plan1', patientId: 'p1', year: 2026, confirmedAt: now, pushedAt: now,
    moduleData: { management_targets: { records: [] }, abnormal_followup: { records: [{ items: '肌酐复查', time: '2026-11-28' }] } } };
  const flow = project(patient, 2026, [plan], [{ ...report, advisorInterpretationConfirmedAt: now }], now);
  assert.equal(flow.step, 'execution');
  assert.equal(flow.steps.find(row => row.key === 'goals').status, 'complete');
});

test('只给所属顾问的有效年度客户投影一张流程卡', async () => {
  let planRows = [], reportRows = [report];
  const users = { find: filter => {
    assert.equal(filter.assignedFamilyDoctor, 'advisor');
    return { select: () => ({ lean: async () => [
      { ...patient, membershipTier: 'annual' },
      { ...patient, _id: 'p2', membershipTier: 'basic' },
    ] }) };
  } };
  const deps = {
    User: users,
    AnnualPlan: { find: () => ({ select: () => ({ lean: async () => planRows }) }) },
    ServicePackage: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    AnnualPlanPreparation: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
    MedicalReport: { find: () => ({ select: () => ({ lean: async () => reportRows }) }) },
    resolveServiceAccess: async () => ({ active: true, startDate: '2026-06-01' }),
  };
  const rows = await load({ _id: 'advisor', role: 'familyDoctor' }, now, deps);
  assert.deepEqual(rows.map(row => row.patientId), ['p1']);
  assert.equal(rows[0].link, '/patients/p1/annual-workflow?year=2026');
  planRows = [{ _id: 'plan1', patientId: 'p1', year: 2026, pushedAt: now, confirmedAt: now,
    moduleData: { abnormal_followup: { records: [{ items: '肌酐复查' }] } } }];
  reportRows = [{ ...report, advisorInterpretationConfirmedAt: now }];
  assert.deepEqual(await load({ _id: 'advisor', role: 'familyDoctor' }, now, deps), []);
  assert.equal((await load({ _id: 'advisor', role: 'familyDoctor' }, now, deps, 'p1', true))[0].step, 'execution');
});

test('筛查核对完成必须由顾问留结论，其他阶段不得重复确认', async t => {
  const patientId = '6a4ef1980f2291549b4ffd8d';
  const handler = router.stack.find(layer => layer.route?.path === '/patients/:id/annual-workflow/confirm-screening')?.route.stack.at(-1).handle;
  assert.equal(typeof handler, 'function');
  let currentStep = 'screening', saved = null;
  t.mock.method(workflow, 'load', async () => [{ year: 2026, step: currentStep }]);
  t.mock.method(AnnualPlanPreparation, 'findOneAndUpdate', async (query, update) => { saved = { query, update }; });
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ aiHealthSummary: {} }) }) }));
  const run = async (role, note) => {
    const req = { params: { id: patientId }, staff: { _id: 'advisor', role }, body: { note } };
    const result = { code: 200 };
    const res = { status(code) { result.code = code; return this; }, json(value) { result.value = value; return this; } };
    await handler(req, res); return result;
  };
  assert.equal((await run('nutritionist', '已核对原始资料')).code, 403);
  assert.equal((await run('superadmin', '短')).code, 400);
  assert.equal((await run('superadmin', '已核对原始资料与待补检查')).code, 200);
  assert.equal(saved.query.year, 2026);
  assert.equal(saved.update.$set.screeningConfirmedNote, '已核对原始资料与待补检查');
  currentStep = 'plan';
  assert.equal((await run('superadmin', '已核对原始资料与待补检查')).code, 409);
});
