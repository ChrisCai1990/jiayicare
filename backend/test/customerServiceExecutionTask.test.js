const test = require('node:test');
const assert = require('node:assert/strict');
const { isCustomerServiceExecutionTask } = require('../src/utils/customerServiceExecutionTask');

test('服务执行只计客户任务，内部审核与岗位流转留在工作台', () => {
  const customerTask = { sourceType: 'scheduled', theme: '复查提醒', status: 'planned' };
  assert.equal(isCustomerServiceExecutionTask(customerTask), true);
  assert.equal(isCustomerServiceExecutionTask({ ...customerTask, status: 'completed' }), true);
  assert.equal(isCustomerServiceExecutionTask({ ...customerTask, clientVisible: false }), false);
  assert.equal(isCustomerServiceExecutionTask({ ...customerTask, theme: '标准随访 · 【日常跟进】' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'report_followup', workflowKey: 'report_followup:advisor_review', taskRole: 'executor' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'professional_assessment', workflowKey: 'annual_nutrition_assessment', taskRole: 'executor' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'annual_service', workflowKey: 'service_request' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'annual_preparation', theme: '资料核对' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'order', workflowKey: 'medical_proxy:execute', taskRole: 'executor' }), false);
  assert.equal(isCustomerServiceExecutionTask({ sourceType: 'order', workflowKey: 'medical_reminder:followup' }), true);
  assert.equal(isCustomerServiceExecutionTask({ ...customerTask, aiStatus: 'pending' }), false);
  assert.equal(isCustomerServiceExecutionTask({ ...customerTask, isBlocked: true }), false);
});
