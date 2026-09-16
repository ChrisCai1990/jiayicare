const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReverseModelRows } = require('../src/utils/serviceWorkflowReverseModel');

test('反向建模识别医护端模板与Admin产品尚未建立显式映射', () => {
  const rows = buildReverseModelRows([
    { _id: 't1', name: '陪同就医服务', status: 'active', content: { followUpPlans: [{ id: 'p1' }] } },
  ], [
    { _id: 'x1', name: '陪同就医服务', status: 'on', serviceWorkflow: { key: 'medical_assist', modules: [{ planId: 'p1' }] } },
  ]);
  assert.equal(rows.find(row => row.key === 'medical_escort').status, 'unlinked');
});

test('显式产品映射和岗位节点一致时标记为已对齐', () => {
  const rows = buildReverseModelRows([
    { _id: 't1', name: '陪同就医服务', status: 'active', content: { serviceProductId: 'x1', followUpPlans: [{ id: 'p1' }] } },
  ], [
    { _id: 'x1', name: '陪同就医服务', status: 'on', serviceWorkflow: { key: 'medical_assist', modules: [{ planId: 'p1' }] } },
  ]);
  assert.equal(rows.find(row => row.key === 'medical_escort').status, 'aligned');
});

test('医疗代诊按已经跑通的专用代码流程建模，不要求重复配置岗位模块', () => {
  const rows = buildReverseModelRows([
    { _id: 't2', name: '医疗代诊服务', status: 'active', content: { serviceProductId: 'x2' } },
  ], [
    { _id: 'x2', name: '医疗代诊服务', status: 'on', serviceWorkflow: { key: 'medical_proxy', modules: [] } },
  ]);
  assert.equal(rows.find(row => row.key === 'medical_proxy').status, 'aligned');
});
