const test = require('node:test');
const assert = require('node:assert/strict');
const { load, project, stepLink, steps, workflowYear } = require('../src/utils/annualManagementWorkflow');
const reviewPolicy = require('../src/utils/managementReviewPolicy');
const workflow = require('../src/utils/annualManagementWorkflow');
const { approvedItems } = require('../src/utils/aiHealthCheckupItems');

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
    '/patients/p1?tab=reports&workflowStep=interpretation&annualWorkflowYear=2026#annual-report-interpretation');
  assert.equal(flow.steps.find(row => row.key === 'screening').link,
    '/patients/p1?tab=ai&workflowStep=screening&annualWorkflowYear=2026#screening-results');
  assert.equal(flow.steps.find(row => row.key === 'goals').link,
    '/patients/p1/annual-health?year=2026#annual-management-goals');
  assert.equal(flow.steps.find(row => row.key === 'assessment').link,
    '/patients/p1?tab=aiReview&workflowStep=assessment&annualWorkflowYear=2026#annual-workflow-assessment');
  for (const step of steps) assert.ok(stepLink('p1', 2026, step).startsWith('/patients/p1'));
  const interpreted = { ...report, advisorInterpretationConfirmedAt: now };
  assert.equal(project(patient, 2026, [], [interpreted], now).step, 'goals');
  assert.equal(project(patient, 2026, [], [interpreted], now).steps.find(row => row.key === 'screening').status, 'complete');
});

test('服务起始年与当年已发布方案不同，流程使用正式方案年度', () => {
  const access = { startDate: '2025-12-01' };
  const at = new Date('2026-11-18T04:00:00Z');
  assert.equal(workflowYear('p1', access, at, []), 2025);
  assert.equal(workflowYear('p1', access, at, [{ patientId: 'p1', year: 2026, pushedAt: at }]), 2026);
  assert.equal(workflowYear('p1', access, at, [{ patientId: 'p1', year: 2026 }]), 2025);
});

test('方案已推送并生成随访时进入执行，客户确认仍单独显示待完成', () => {
  const pushed = { _id: 'pushed', patientId: 'p1', year: 2026, pushedAt: now, confirmedAt: null, moduleData: {} };
  const interpreted = { ...report, advisorInterpretationConfirmedAt: now };
  const flow = project(patient, 2026, [pushed], [interpreted], now);
  assert.equal(flow.step, 'execution');
  assert.equal(flow.steps.find(row => row.key === 'plan').status, 'complete');
  assert.equal(flow.steps.find(row => row.key === 'execution').status, 'active');
  assert.match(flow.summary, /待客户确认/);
});

test('已有确认方案保留原件；新报告先解读，之后进入目标或执行', t => {
  t.mock.method(reviewPolicy, 'restored', () => true);
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

test('按方案分流后，旧方案继续执行，新方案缺目标时返回目标步骤', t => {
  t.mock.method(reviewPolicy, 'restored', () => false);
  const plan = { _id: 'legacy', patientId: 'p1', year: 2026, confirmedAt: now, pushedAt: now,
    moduleData: { management_targets: { records: [] } } };
  const flow = project(patient, 2026, [plan], [{ ...report, advisorInterpretationConfirmedAt: now }], now);
  assert.equal(flow.step, 'execution');
  assert.equal(project(patient, 2026, [{ ...plan, flowVersion: 2 }], [{ ...report, advisorInterpretationConfirmedAt: now }], now).step, 'goals');
});

test('已分析但未获顾问确认的报告仍在解读步骤，退回修改的报告暂不重复待确认', () => {
  const analyzed = { ...report, status: 'analyzed' };
  assert.equal(project(patient, 2026, [], [analyzed], now).step, 'interpretation');
  assert.equal(project(patient, 2026, [], [{ ...analyzed, advisorCorrection: { status: 'returned' } }], now).step, 'preparation');
});
test('确认方案已有标准事项目标时不再提示年度目标待确认', t => {
  const plan = { _id: 'plan1', patientId: 'p1', year: 2026, flowVersion: 2, confirmedAt: now, pushedAt: now,
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
    AIHealthCheckupReview: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
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

test('已审核 AI 明确待补检查沿用审核结论，含糊提示仍需核对', () => {
  const summary = { sections: { checkup_completeness: { missing: ['骨密度检查'] } }, approvedAt: now };
  const withAI = { ...patient, aiHealthSummary: summary };
  const interpreted = { ...report, advisorInterpretationConfirmedAt: now };
  const item = approvedItems(summary, 2026).items[0];
  assert.equal(project(withAI, 2026, [], [interpreted], now).step, 'goals');
  const review = { patientId: 'p1', year: 2026, sourceVersion: approvedItems(summary, 2026).version,
    sourceKey: item.sourceKey, itemText: item.text };
  assert.equal(project(withAI, 2026, [], [interpreted], now, [review]).step, 'goals');
  const changed = { ...summary, sections: { checkup_completeness: { missing: ['骨密度检查', '肺功能检查'] } } };
  assert.equal(project({ ...patient, aiHealthSummary: changed }, 2026, [], [interpreted], now, [review]).step, 'goals');
  const unclear = { ...summary, sections: { checkup_completeness: { missing: ['胃镜和肠镜筛查情况待核实'] } } };
  assert.equal(project({ ...patient, aiHealthSummary: unclear }, 2026, [], [interpreted], now).step, 'screening');
  assert.equal(project(withAI, 2026, [], [report], now, [review]).step, 'interpretation');
});
