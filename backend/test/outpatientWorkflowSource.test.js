const test = require('node:test');
const assert = require('node:assert/strict');
const { embeddedOutpatientModules, applyOutpatientModules } = require('../src/utils/outpatientWorkflowSource');

test('门诊方案以产品六阶段流程覆盖旧模板节点', () => {
  const plans = [
    { _id: 'first', name: '门诊一站式：资料收集与核对', status: 'active', reviewStatus: 'approved' },
    { _id: 'second', name: '门诊一站式：健康顾问评估', status: 'active', reviewStatus: 'approved' },
  ];
  const modules = embeddedOutpatientModules({ serviceWorkflow: { key: 'medical_assist', modules: [{ planId: 'first' }, { planId: 'second' }] } }, plans);
  const content = applyOutpatientModules({ followUpPlans: [{ id: 'obsolete', name: '出院手续办理' }], moduleData: { visit: { hospital: '医院' } } }, modules);
  assert.deepEqual(content.followUpPlans.map(item => item.id), ['first', 'second']);
  assert.deepEqual(content.workflowModules.map(item => item.sequence), [0, 1]);
  assert.equal(content.moduleData.visit.followUpPlanId, 'first');
  assert.equal(content.moduleData.visit.hospital, '医院');
});

test('首节点缺失或停用时拒绝创建错误的任务链', () => {
  assert.throws(() => embeddedOutpatientModules({ serviceWorkflow: { key: 'medical_assist', modules: [{ planId: 'missing' }] } }, []), /岗位流程已变化/);
  assert.throws(() => embeddedOutpatientModules({ serviceWorkflow: { key: 'medical_assist', modules: [{ planId: 'first' }] } }, [{ _id: 'first', name: '通用代办', status: 'active' }]), /首个岗位任务/);
});
