const test = require('node:test');
const assert = require('node:assert/strict');

test('规划师接收任务优先显示，待上游执行时仍可看到督办进度', async () => {
  const { groupServiceTasks, isServiceActionable } = await import('../src/utils/workbenchReminder.mjs');
  const plan = { _id: 'plan', title: '门诊一站式服务', content: { workflowModules: [{ id: 'first', sequence: 0 }] } };
  const supervisor = { _id: 'supervisor', coordinationGroupId: 'medical-assist:plan', sourceType: 'health_plan', sourceHealthPlanId: plan, workflowKey: 'first', taskRole: 'supervisor', isBlocked: true, date: '2026-11-06T00:00:00Z' };
  const assignment = { ...supervisor, _id: 'assignment', workflowKey: 'system:outpatient_initial_assignment', taskRole: 'executor', isBlocked: false, date: '2026-11-04T07:32:00Z' };
  const now = new Date('2026-11-04T07:35:00Z');
  const [group] = groupServiceTasks([supervisor, assignment]);
  assert.equal(group.task._id, 'assignment');
  assert.equal(isServiceActionable(group, now), true);
  assert.equal(isServiceActionable(groupServiceTasks([supervisor])[0], now), true);
});
