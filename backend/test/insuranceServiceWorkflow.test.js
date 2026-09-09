const test = require('node:test');
const assert = require('node:assert/strict');
const { stepsForInsuranceScenario } = require('../src/utils/insuranceServiceWorkflow');

test('住院场景包含预授权、住院跟踪和理赔闭环', () => {
  const steps = stepsForInsuranceScenario('inpatient');
  assert.ok(steps.some(item => item.includes('预授权')));
  assert.ok(steps.some(item => item.includes('住院期间')));
  assert.ok(steps.at(-1).includes('赔付'));
});

test('未知场景安全回退到事后报销流程', () => {
  const steps = stepsForInsuranceScenario('unknown');
  assert.ok(steps[0].includes('医疗费用'));
  assert.ok(steps.at(-1).includes('赔付'));
});

test('每次返回独立数组，调用方修改不会污染模板', () => {
  const first = stepsForInsuranceScenario('outpatient');
  first.push('污染');
  assert.equal(stepsForInsuranceScenario('outpatient').includes('污染'), false);
});
