const test = require('node:test');
const assert = require('node:assert/strict');
const { dynamicFollowUpEligibility } = require('../src/utils/dynamicFollowUpEligibility');

const base = { patientId: 'patient', sourceId: 'source', existingFollowUpCount: 0 };

test('已跑通的一站式及订单专用链路不会进入通用随访生成器', () => {
  for (const workflowKey of ['medical_proxy:post_visit_review', 'medication_proxy:execute', 'checkup_appointment:advisor_review', 'checkup_one_stop:result_review', 'system:outpatient_post_visit_review']) {
    assert.deepEqual(dynamicFollowUpEligibility({ ...base, workflowKey }), { eligible: false, reason: 'specialized_workflow' });
  }
});

test('历史专用来源标记同样阻止重复建立随访', () => {
  assert.equal(dynamicFollowUpEligibility({ ...base, formData: { generatedFromExpertAppointment: true } }).eligible, false);
  assert.equal(dynamicFollowUpEligibility({ ...base, sourceType: 'health_plan', theme: '门诊一站式服务' }).eligible, false);
});

test('已有后续随访时保持幂等，不再生成第二条', () => {
  assert.deepEqual(dynamicFollowUpEligibility({ ...base, existingFollowUpCount: 1 }), { eligible: false, reason: 'follow_up_exists' });
});

test('只有来源完整且没有专用链路的普通事件可以进入通用机制', () => {
  assert.deepEqual(dynamicFollowUpEligibility(base), { eligible: true, reason: 'generic_event' });
});
