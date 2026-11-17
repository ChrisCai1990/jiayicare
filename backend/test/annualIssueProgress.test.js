const test = require('node:test');
const assert = require('node:assert/strict');
const { project } = require('../src/utils/annualIssueProgress');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');

test('年度岗位任务沿用原管理问题 ID，进展不会被误判为目标完成', () => {
  const issueId = 'management_issue:lung';
  const task = buildAnnualPlanServiceTasks({ pushedAt: new Date(), moduleData: {
    medical_treatment: { records: [{ sourceIds: [issueId], serviceMode: 'single', visit_time: '2026-12-01', items: '专科就医' }] },
  } }, { assignedHealthPlanner: 'planner' })[0];
  assert.deepEqual(task.managementIssueIds, [issueId]);
  const result = project([{ issueId }], [{ _id: 'task', ...task, status: 'completed', completedAt: new Date('2026-12-01'),
    executedContent: '已完成预约', assignedTo: { name: '规划师', role: 'healthPlanner' } }]);
  assert.equal(result[0].tasks[0].result, '已完成预约');
  assert.equal(result[0].tasks[0].assignee, '规划师');
  assert.equal(result[0].totalTasks, 1);
  assert.equal('goalCompleted' in result[0], false);
});

test('旧服务任务可从已保存的事项快照回查管理问题，不归错其他问题', () => {
  const tasks = [{ _id: 'old', status: 'planned', theme: '待安排', formData: { serviceRequest: { itemSnapshot: { sourceIds: ['management_issue:a'] } } } }];
  const rows = project([{ issueId: 'management_issue:a' }, { issueId: 'management_issue:b' }], tasks);
  assert.deepEqual(rows.map(row => row.totalTasks), [1, 0]);
});
