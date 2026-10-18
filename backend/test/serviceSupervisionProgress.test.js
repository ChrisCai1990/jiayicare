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
    { _id: 'open', status: 'planned', theme: '顾问审核', createdAt: '2026-10-02' },
  ], current);
  assert.equal(progress.observed, true);
  assert.equal(progress.total, null);
  assert.deepEqual(progress.steps.map(step => step.state), ['past', 'current']);
});
