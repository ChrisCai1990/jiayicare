const test = require('node:test');
const assert = require('node:assert/strict');
const { orderServiceType } = require('../src/utils/orderServiceType');

test('the purchased service determines the workflow for every order of that type', () => {
  const cases = [
    [{ serviceName: '就医陪同服务', serviceWorkflowSnapshot: { key: 'medical_assist' } }, 'medical_escort'],
    [{ serviceName: '陪同看诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' }, medicalProxyPlan: { medicalEscort: true } }, 'medical_escort'],
    [{ serviceName: '医疗代诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }, 'medical_proxy'],
    [{ serviceName: '医务代办服务', serviceWorkflowSnapshot: { key: 'medical_assist' } }, 'medical_assist'],
    [{ serviceName: '医务代办服务', specificationLabel: '代约检（常规）', serviceWorkflowSnapshot: { key: 'medical_assist' } }, 'checkup_appointment'],
    [{ serviceName: '代配药服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }, 'medication_proxy'],
    [{ serviceName: '代配营养素服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }, 'supplement_proxy'],
    [{ serviceName: '健康体检服务', specificationLabel: '复查督办服务' }, 'medical_reminder'],
    [{ serviceName: '专家约诊服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }, 'expert_appointment'],
    [{ serviceName: '就医规划服务', serviceWorkflowSnapshot: { key: 'medical_proxy' } }, 'medical_planning'],
    [{ serviceName: '2026年度体检', serviceWorkflowSnapshot: { key: 'checkup' } }, 'checkup'],
    [{ serviceName: 'IBD 年度专病管理服务', specialtyTermsSnapshot: { key: 'ibd' } }, 'ibd'],
  ];
  for (const [source, expected] of cases) {
    for (const patientId of ['customer-A', 'customer-B']) {
      assert.equal(orderServiceType({ ...source, user: patientId, _id: `${patientId}-${expected}` }), expected);
    }
  }
});

test('free-text mentions cannot reroute an order into a different service', () => {
  const source = { serviceName: '医务代办服务', serviceWorkflowSnapshot: { key: 'medical_assist' },
    note: '客户还问了代配药和代约检', serviceRequirements: '后续可能需要专家约诊' };
  assert.equal(orderServiceType(source), 'medical_assist');
  assert.equal(orderServiceType({ ...source, specificationLabel: '代配药' }), 'medication_proxy');
  assert.equal(orderServiceType({ ...source, note: '以后再做复查督办' }), 'medical_assist');
});
