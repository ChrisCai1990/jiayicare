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
  assert.equal(checkup.total, 5);
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

test('medical escort order shows its service path from intake', () => {
  const source = { serviceName: '就医陪同服务', serviceWorkflowSnapshot: { key: 'medical_assist' }, currentStage: 'intake' };
  const intake = serviceProgress('order', source, [{ theme: '订单服务：就医陪同服务', status: 'planned' }], current);
  assert.equal(intake.step, 1);
  assert.equal(intake.total, 5);
  assert.equal(intake.observed, undefined);
  const executing = serviceProgress('order', { ...source, currentStage: 'plan_draft' }, [
    { sourceHealthPlanId: 'plan', taskRole: 'executor', status: 'planned' },
  ], current);
  assert.equal(executing.step, 4);
  const closing = serviceProgress('order', { ...source, currentStage: 'pending_closure' }, [], current);
  assert.equal(closing.step, 5);
});

test('medical proxy order shows its service path from intake', () => {
  const source = { serviceName: '医疗代诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' }, currentStage: 'intake' };
  const intake = serviceProgress('order', source, [{ theme: '订单服务：医疗代诊服务', status: 'planned' }], current);
  assert.equal(intake.step, 1);
  assert.equal(intake.total, 5);
  const started = serviceProgress('order', source, [{ workflowKey: 'medical_proxy:intake', taskRole: 'supervisor', status: 'planned' }], current);
  assert.equal(started.step, 1);
  assert.equal(started.total, 5);
  assert.deepEqual(started.steps.map(step => step.label), [
    '规划师核对代诊需求', '确认代诊方案与资料', '预约并安排代诊人员', '代诊执行与资料归档', '规划师验收结案',
  ]);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'audit' }, [], current).step, 2);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'booking' }, [], current).step, 3);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'execute' }, [], current).step, 4);
  assert.equal(serviceProgress('order', { ...source, currentStage: 'pending_closure' }, [], current).step, 5);
});

test('legacy medical assistant orders and medication orders show the full service path', () => {
  const agency = serviceProgress('order', { serviceName: '医务代办服务', currentStage: 'intake' },
    [{ _id: 'intake', status: 'planned', theme: '订单服务：医务代办服务' }], current);
  assert.equal(agency.step, 1);
  assert.equal(agency.total, 4);
  const medication = serviceProgress('order', { serviceName: '代配药服务', currentStage: 'booking' },
    [{ workflowKey: 'medical_proxy:booking', status: 'planned' }], current);
  assert.equal(medication.step, 4);
  assert.equal(medication.total, 7);
});

test('all orders of the same service type show the full path before tasks are dispatched', () => {
  for (const user of ['customer-A', 'customer-B']) {
    const checkup = serviceProgress('order', { user, serviceName: '医务代办服务',
      specificationLabel: '代约检（常规）', currentStage: 'intake' }, [], current);
    assert.equal(checkup.step, 1);
    assert.equal(checkup.total, 6);
    assert.equal(serviceProgress('order', { user, serviceName: '医务代办服务',
      specificationLabel: '代约检（常规）', currentStage: 'checkup_manager_review' }, [], current).step, 4);
    const planning = serviceProgress('order', { user, serviceName: '就医规划服务',
      serviceWorkflowSnapshot: { key: 'medical_proxy' }, currentStage: 'advisor' }, [], current);
    assert.equal(planning.step, 2);
    assert.equal(planning.total, 3);
    assert.equal(serviceProgress('order', { user, serviceName: '医务代办服务',
      note: '客户另问代配药', currentStage: 'intake' }, [], current).total, 4);
    const supplement = serviceProgress('order', { user, serviceName: '代配营养素服务',
      serviceWorkflowSnapshot: { key: 'medical_proxy' }, currentStage: 'booking' }, [], current);
    assert.equal(supplement.step, 2);
    assert.equal(supplement.total, 5);
    const reminder = serviceProgress('order', { user, serviceName: '健康体检服务',
      specificationLabel: '复查督办服务', currentStage: 'advisor_review' }, [], current);
    assert.equal(reminder.step, 2);
    assert.equal(reminder.total, 5);
  }
});

test('expert appointment progress uses the active post-visit review when the legacy order stage is stale', () => {
  const progress = serviceProgress('order', { serviceName: '专家约诊服务', currentStage: 'intake' }, [
    { workflowKey: 'medical_proxy:booking', status: 'completed' },
    { workflowKey: 'medical_proxy:post_visit_audit', status: 'completed' },
    { sourceScheduleKey: 'expert_appointment_followup:order', status: 'planned' },
  ], current);
  assert.equal(progress.step, 4);
  assert.equal(progress.total, 5);
  assert.equal(progress.label, '顾问审核约诊后随访');
});

test('escort progress is selected by the order workflow flag across service names', () => {
  for (const serviceName of ['陪同看诊服务', '就医陪同服务']) {
    const source = { serviceName, serviceWorkflowSnapshot: { key: 'medical_proxy' },
      medicalProxyPlan: { medicalEscort: true }, currentStage: 'booking' };
    const progress = serviceProgress('order', source, [
      { workflowKey: 'medical_proxy:booking', status: 'planned' },
    ], current);
    assert.equal(progress.step, 3);
    assert.equal(progress.total, 5);
    assert.equal(progress.observed, undefined);
    assert.deepEqual(progress.steps.map(step => step.label), [
      '规划师确认陪同需求', '规划师安排陪同方案与人员', '健管确认陪同预约', '就医专员陪同及资料审核', '规划师验收结案',
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
  assert.equal(progress.total, 7);
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
