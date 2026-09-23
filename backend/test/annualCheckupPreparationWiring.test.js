const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sift = require('sift').default;
const plugin = require('../src/utils/followUpServiceLinkPlugin');
const link = require('../src/utils/followUpServiceLink');
const prep = require('../src/utils/annualCheckupEvidence');

test('体检方案保存/单ID更新触发精确来源同步，不改变原服务关联钩子', async t => {
  const calls = [];
  t.mock.method(link, 'safeReconcileServiceLinks', async input => calls.push(['service', input]));
  t.mock.method(prep, 'safeReconcileCheckupPreparation', async input => calls.push(['preparation', input]));
  const hooks = {}; plugin({ post: (name, fn) => { hooks[name] = fn; } }, { targetType: 'health_plan' });
  await hooks.save({ _id: 'p1' });
  await hooks.findOneAndUpdate({ _id: 'p2' });
  await hooks.updateOne.call({ getFilter: () => ({ _id: 'p3' }) });
  assert.deepEqual(calls.map(row => row[0]), ['service', 'preparation', 'service', 'preparation', 'service', 'preparation']);
  assert.deepEqual(calls.filter(row => row[0] === 'preparation').map(row => row[1]), ['p1', 'p2', 'p3'].map(id => ({ 'formData.annualCheckupPreparation.evidence.healthPlanId': id })));
  await hooks.updateOne.call({ getFilter: () => ({ _id: { $in: ['p4'] } }) });
  assert.equal(calls.length, 6);
});

test('订单写入仍只走原关联同步，不借机扫描体检准备', async t => {
  let count = 0;
  t.mock.method(link, 'safeReconcileServiceLinks', async () => { count++; });
  t.mock.method(prep, 'safeReconcileCheckupPreparation', async () => assert.fail('订单不扫描准备任务'));
  const hooks = {}; plugin({ post: (name, fn) => { hooks[name] = fn; } }, { targetType: 'order' });
  await hooks.save({ _id: 'order' }); assert.equal(count, 1);
});

test('通用服务清理不取消独立准备任务，仍清理旧未采用的普通服务需求', () => {
  const source = fs.readFileSync(require.resolve('../src/utils/annualPlanServiceTasks'), 'utf8');
  assert.match(source, /workflowKey: 'service_request', annualDispatch: null/);
  const matches = sift({ workflowKey: 'service_request', annualDispatch: null });
  assert.equal(matches({ workflowKey: 'annual_checkup_preparation:familyDoctor' }), false);
  assert.equal(matches({ workflowKey: 'annual_checkup_preparation:healthPlanner' }), false);
  assert.equal(matches({ workflowKey: 'service_request' }), true);
  assert.equal(matches({}), false);
  assert.equal(matches({ workflowKey: 'assistance_execute' }), false);
  assert.equal(matches({ workflowKey: 'service_request', annualDispatch: { status: 'active' } }), false);
});
