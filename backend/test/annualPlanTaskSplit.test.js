const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualPlanKickoffTasks } = require('../src/utils/annualPlanTaskSplit');

test('年度方案确认后按客户、健管专员和健康规划师拆分启动任务', () => {
  const confirmedAt = new Date('2026-08-28T00:00:00.000Z');
  const rows = buildAnnualPlanKickoffTasks(
    { year: 2026, confirmedAt },
    { assignedHealthManager: 'hm-1', assignedHealthPlanner: 'hp-1' },
    confirmedAt,
  );
  assert.equal(rows.client.key, 'client_plan_execution');
  assert.equal(rows.client.dueDate, '2026-09-04');
  assert.deepEqual(rows.staff.map(item => [item.key, item.assignedTo]), [
    ['health_manager_kickoff', 'hm-1'], ['health_planner_coordination', 'hp-1'],
  ]);
});

test('未绑定角色时不伪造负责人', () => {
  const rows = buildAnnualPlanKickoffTasks({ year: 2026 }, {}, new Date('2026-08-28T00:00:00.000Z'));
  assert.equal(rows.staff.length, 0);
});
