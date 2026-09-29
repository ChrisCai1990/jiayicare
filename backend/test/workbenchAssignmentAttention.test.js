const test = require('node:test'), assert = require('node:assert/strict');
const { loadAssignmentAttention } = require('../src/utils/workbenchAssignmentAttention');

test('缺少负责人属于管理员异常，不投射给健康规划师', async () => {
  const rows = await loadAssignmentAttention({ role: 'healthPlanner', _id: 'planner', tenantId: null });
  assert.deepEqual(rows, []);
});
