const test = require('node:test');
const assert = require('node:assert/strict');
const { customerIntakeError } = require('../src/utils/checkupCustomerIntake');
const service = () => ({ _id: 'service', patientId: 'patient', content: { followUpPlans: [{ id: 'template' }], serviceWorkflowSnapshot: { questionnaireId: 'q' }, checkupIntake: { status: 'submitted', questionnaireId: 'q', responseId: 'r', assignmentId: 'a' } } });
function models({ customer = true, assignment = { sourceHealthPlanId: 'service' }, response = { submittedAt: new Date() } } = {}) {
  return { FollowUpPlan: { exists: async () => customer }, PushRecord: { findOne: query => {
    assert.equal(query.patientId, 'patient'); assert.equal(query.questionnaireId, 'q');
    return { lean: async () => assignment };
  } }, QuestionnaireResponse: { findOne: query => {
    assert.equal(query.user, 'patient'); assert.equal(query.pushRecordId, 'a'); assert.equal(query.questionnaire, 'q');
    return { lean: async () => response };
  } } };
}
test('customer stage without binding fails closed, legacy no-questionnaire service remains compatible', async () => {
  const s = service(); delete s.content.serviceWorkflowSnapshot;
  assert.match(await customerIntakeError(s, models()), /尚未绑定问卷/);
  assert.equal(await customerIntakeError(s, models({ customer: false })), '');
});
test('submitted flag alone never replaces response and assignment evidence', async () => {
  const s = service(); delete s.content.checkupIntake.responseId;
  assert.match(await customerIntakeError(s, models()), /等待客户/);
  assert.match(await customerIntakeError(service(), models({ assignment: { sourceHealthPlanId: 'other' } })), /不符/);
  assert.match(await customerIntakeError(service(), models({ response: null })), /凭据缺失/);
});
test('only matching service or matching order questionnaire submission passes', async () => {
  assert.equal(await customerIntakeError(service(), models()), '');
  const s = service(); s.sourceOrderId = 'order';
  assert.equal(await customerIntakeError(s, models({ assignment: { sourceOrderId: 'order' } })), '');
  assert.match(await customerIntakeError(s, models({ assignment: { sourceOrderId: 'order', sourceHealthPlanId: 'other' } })), /不符/);
});
