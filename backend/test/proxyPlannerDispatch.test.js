const test = require('node:test');
const assert = require('node:assert/strict');
const { needsPlannerDispatch } = require('../src/utils/proxyPlannerDispatch');

test('direct advisor proxy requires planner handoff after booking', () => {
  assert.equal(needsPlannerDispatch({ planSnapshot: { initiationSource: 'staff_direct' } }, '医疗代诊服务'), true);
});
test('preserves existing storefront pre-assignment and other services', () => {
  assert.equal(needsPlannerDispatch({}, '医疗代诊服务'), false);
  for (const name of ['专家约诊服务', '陪同就医服务', '代配药', '代取药', '代配营养素', '就医规划']) {
    assert.equal(needsPlannerDispatch({ planSnapshot: { initiationSource: 'staff_direct' } }, name), false);
  }
  for (const flag of ['medicalEscort', 'medicationProxy', 'supplementProxy', 'medicalPlanning']) {
    assert.equal(needsPlannerDispatch({ planSnapshot: { initiationSource: 'staff_direct', [flag]: true } }, '医疗代诊服务'), false);
  }
});
