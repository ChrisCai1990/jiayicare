const test = require('node:test');
const assert = require('node:assert/strict');
const { serviceProgress } = require('../src/utils/serviceSupervisionProgress');

const current = [{ label: '当前任务' }];

test('decision and checkup orders use their own ordered stages', () => {
  const decision = serviceProgress('order', { serviceName: '企业家健康决策计划', currentStage: 'advisor' }, [], current);
  assert.equal(decision.step, 2);
  assert.equal(decision.total, 6);
  assert.equal(decision.label, '顾问确定方案并转介');
  const checkup = serviceProgress('order', { serviceWorkflowSnapshot: { key: 'checkup' }, currentStage: 'checkup_manager_review' }, [], current);
  assert.equal(checkup.step, 3);
  assert.equal(checkup.total, 4);
});

test('IBD annual service shows its complete path instead of the generated task list', () => {
  const source = { specialtyTermsSnapshot: { key: 'ibd', includedEscorts: 2 },
    specialtyService: { key: 'ibd', usedEscorts: 0, endsAt: '2027-10-14' }, currentStage: 'ibd_escort_meeting' };
  const progress = serviceProgress('order', source, [
    { workflowKey: 'ibd:advisor', status: 'completed' }, { workflowKey: 'ibd:escort', status: 'planned' },
  ], current, new Date('2026-10-18'));
  assert.equal(progress.step, 5);
  assert.equal(progress.total, 7);
  assert.equal(progress.observed, undefined);
  assert.deepEqual(progress.steps.map(step => step.state), ['past', 'past', 'past', 'past', 'current', 'future', 'future']);
  assert.match(progress.note, /0\/2/);
  const review = serviceProgress('order', { ...source, currentStage: 'ibd_awaiting_first_visit' }, [], current, new Date('2027-10-15'));
  assert.equal(review.step, 7);
  assert.equal(review.label, '年度回顾与结案');
});

test('medical assistance order shows its order-to-closure path before a plan is generated', () => {
  const source = { serviceName: '就医陪同服务', serviceWorkflowSnapshot: { key: 'medical_assist' }, currentStage: 'intake' };
  const intake = serviceProgress('order', source, [{ theme: '订单服务：就医陪同服务', status: 'planned' }], current);
  assert.equal(intake.step, 1);
  assert.equal(intake.total, 4);
  assert.equal(intake.observed, undefined);
  assert.deepEqual(intake.steps.map(step => step.label), [
    '规划师核对需求并接单', '制定并推送就医协助方案', '服务执行与督办', '规划师验收结案',
  ]);
  const executing = serviceProgress('order', { ...source, currentStage: 'plan_draft' }, [
    { sourceHealthPlanId: 'plan', taskRole: 'executor', status: 'planned' },
  ], current);
  assert.equal(executing.step, 3);
  const closing = serviceProgress('order', { ...source, currentStage: 'pending_closure' }, [], current);
  assert.equal(closing.step, 4);
});

test('medical proxy order shows its path before workflow tasks are generated', () => {
  const source = { serviceName: '医疗代诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' }, currentStage: 'intake' };
  const intake = serviceProgress('order', source, [{ theme: '订单服务：医疗代诊服务', status: 'planned' }], current);
  assert.equal(intake.step, 1);
  assert.equal(intake.total, 5);
  assert.equal(intake.observed, undefined);
  assert.deepEqual(intake.steps.map(step => step.label), [
    '规划师核对代诊需求', '确认代诊方案与资料', '预约并安排代诊人员', '代诊执行与资料归档', '规划师验收结案',
  ]);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'audit' }, [], current).step, 2);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'booking' }, [], current).step, 3);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'execute' }, [], current).step, 4);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'pending_closure' }, [], current).step, 5);
});

test('escort progress is selected by the order workflow flag across service names', () => {
  for (const serviceName of ['陪同看诊服务', '就医陪同服务']) {
    const source = { serviceName, serviceWorkflowSnapshot: { key: 'medical_proxy' },
      medicalProxyPlan: { medicalEscort: true }, currentStage: 'booking' };
    const progress = serviceProgress('order', source, [
      { workflowKey: 'medical_proxy:booking', status: 'planned' },
    ], current);
    assert.equal(progress.step, 2);
    assert.equal(progress.total, 5);
    assert.equal(progress.observed, undefined);
    assert.deepEqual(progress.steps.map(step => step.label), [
      '确认陪同需求与人员安排', '健管确认陪同预约', '就医专员执行陪同', '健管审核就诊资料', '规划师验收结案',
    ]);
  }
  const direct = serviceProgress('order', { medicalProxyPlan: { medicalEscort: true, adHocConsultation: true },
    currentStage: 'execute' }, [], current);
  assert.equal(direct.step, 2);
  assert.equal(direct.total, 4);
});

test('care flow uses its actual path, including the shorter reminder route', () => {
  const progress = serviceProgress('flow', { state: { mode: 'reminder', stage: 'audit' } }, [], current);
  assert.equal(progress.step, 3);
  assert.deepEqual(progress.steps.map(step => step.key), ['advisor', 'upload', 'audit', 'followup', 'draft', 'review']);
});

test('medication order follows its stage tasks without showing the supervision task', () => {
  const progress = serviceProgress('order', { currentStage: 'booking' }, [
    { workflowKey: 'medication_proxy:booking' }, { workflowKey: 'medication_proxy:progress' },
  ], current);
  assert.equal(progress.step, 4);
  assert.equal(progress.total, 6);
  assert.equal(progress.steps[3].label, '健管预约');
});

test('insurance shows case steps and the first unfinished step', () => {
  const progress = serviceProgress('insurance', { steps: [
    { title: '登记', status: 'completed' }, { title: '核实', status: 'pending' }, { title: '提交', status: 'pending' },
  ] }, [], current);
  assert.equal(progress.step, 2);
  assert.equal(progress.label, '核实');
  assert.deepEqual(progress.steps.map(step => step.state), ['past', 'current', 'future']);
});

test('services without a fixed path show actual tasks without inventing a total', () => {
  const progress = serviceProgress('followup', {}, [
    { _id: 'done', status: 'completed', theme: '需求确认', createdAt: '2026-10-01' },
    { _id: 'open', status: 'missed', theme: '顾问审核', createdAt: '2026-10-02' },
  ], current);
  assert.equal(progress.observed, true);
  assert.equal(progress.total, null);
  assert.equal(progress.generatedCompleted, 1);
  assert.equal(progress.generatedTotal, 2);
  assert.deepEqual(progress.steps.map(step => step.state), ['past', 'current']);
  assert.deepEqual(progress.steps.map(step => step.statusLabel), ['已完成', '已逾期']);
});

test('blocked task is labeled as waiting for its prerequisite', () => {
  const progress = serviceProgress('followup', {}, [
    { _id: 'blocked', status: 'planned', isBlocked: true, theme: '安排预约' },
  ], current);
  assert.equal(progress.steps[0].statusLabel, '待前置环节');
  assert.equal(progress.generatedCompleted, 0);
  assert.equal(progress.generatedTotal, 1);
});
