const test = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCT_NAME, TASK_PLAN_DRAFTS, validateDrafts } = require('../src/scripts/seedCheckupOneStopWorkflowDraft');

test('checkup one-stop Admin draft is internally consistent', () => {
  assert.equal(PRODUCT_NAME, '体检一站式服务');
  assert.deepEqual(validateDrafts(), []);
  assert.equal(TASK_PLAN_DRAFTS.length, 8);
  assert.ok(TASK_PLAN_DRAFTS.every(item => item.reviewStatus === 'pending_review'));
  assert.ok(TASK_PLAN_DRAFTS.every(item => item.executorRole !== item.supervisorRole));
  assert.ok(TASK_PLAN_DRAFTS.every(item => item.requiresCoordination === false));
});

test('checkup one-stop draft separates fixed service work from abnormal follow-up review', () => {
  const conditional = TASK_PLAN_DRAFTS.filter(item => item.mode === 'conditional');
  assert.deepEqual(conditional.map(item => item.key), ['abnormal_followup']);
  assert.equal(conditional[0].trigger, 'abnormal_found');
  assert.equal(conditional[0].executorRole, 'familyDoctor');

  const fixed = TASK_PLAN_DRAFTS.filter(item => item.mode === 'fixed');
  assert.deepEqual(fixed.map(item => item.key), ['intake', 'plan_design', 'booking', 'onsite', 'report_collection', 'result_review', 'final_acceptance']);
  assert.deepEqual(fixed.map(item => item.executorRole), ['healthManager', 'familyDoctor', 'healthPlanner', 'medicalAssistant', 'healthManager', 'familyDoctor', 'healthPlanner']);
  assert.equal(fixed.find(item => item.key === 'plan_design').name, '【审核稿】体检方案定制与审核');
  assert.equal(fixed.find(item => item.key === 'onsite').name, '【审核稿】陪同体检与现场记录');
});

test('checkup closure waits for doctor follow-up planning and health-planner final acceptance', () => {
  const resultReview = TASK_PLAN_DRAFTS.find(item => item.key === 'result_review');
  const finalAcceptance = TASK_PLAN_DRAFTS.find(item => item.key === 'final_acceptance');
  assert.equal(resultReview.activationEvent, 'report_audited');
  assert.match(resultReview.completionStandard, /随访计划/);
  assert.equal(finalAcceptance.workflowTaskRole, 'supervisor');
  assert.equal(finalAcceptance.closesService, true);
  assert.match(finalAcceptance.default_content.boundary, /持续作为总督办显示/);
});

test('report task explicitly reuses the existing parse and health-manager review pipeline', () => {
  const reportTask = TASK_PLAN_DRAFTS.find(item => item.key === 'report_collection');
  assert.match(reportTask.default_content.boundary, /现有报告专用流程/);
  assert.match(reportTask.completionStandard, /AI解析和健管审核链路/);
});
