const test = require('node:test'), assert = require('node:assert/strict');
const { summarize, scope } = require('../src/utils/supervisionProgress');
const task = { patientId: 'p', sourceOrderId: 'o', taskRole: 'supervisor', formData: { currentStage: 'booking' } };
const row = patch => ({ patientId: 'p', sourceOrderId: 'o', taskRole: 'executor', status: 'planned', ...patch });
test('actual unlocked advisor wins over stale booking display; no mutation', () => {
  const rows = [row({ _id: 'a', theme: '顾问确认', status: 'in_progress', assignedTo: { name: '顾问' } }), row({ _id: 'b', isBlocked: true, theme: '预约' })];
  const before = JSON.stringify(rows), p = summarize(task, rows);
  assert.equal(p.current.length, 1); assert.equal(p.current[0].label, '顾问确认'); assert.equal(p.current[0].assignee, '顾问');
  assert.equal(p.total, 2); assert.equal(JSON.stringify(rows), before); assert.equal(task.formData.currentStage, 'booking');
});
test('patient/service boundaries and cancelled/supervisor rows excluded', () => {
  const p = summarize(task, [row({ status: 'completed' }), row({ patientId: 'other' }), row({ sourceOrderId: 'other' }), row({ status: 'cancelled' }), row({ taskRole: 'supervisor' })]);
  assert.equal(p.total, 1); assert.equal(p.completed, 1); assert.match(p.message, /待核对/);
});
test('order intake is not counted as a second active service stage', () => {
  const p = summarize({ ...task, sourceType: 'order' }, [
    row({ _id: 'intake', taskRole: '', theme: '订单服务', assignedTo: { name: '规划师' } }),
    row({ _id: 'booking', theme: '健管预约', assignedTo: { name: '健管专员' } }),
  ]);
  assert.equal(p.total, 1);
  assert.deepEqual(p.current.map(item => item.label), ['健管预约']);
});
test('legacy medication progress does not mask the planner assignment', () => {
  const p = summarize({ ...task, sourceType: 'order', workflowKey: 'medication_proxy:progress' }, [
    row({ _id: 'progress', workflowKey: 'medication_proxy:progress', theme: '规划师查看进度', status: 'in_progress' }),
    row({ _id: 'assignment', workflowKey: 'medication_proxy:planner', theme: '健康规划师分配就医专员', assignedTo: { name: '规划师' } }),
  ]);
  assert.equal(p.total, 1);
  assert.deepEqual(p.current.map(item => item.label), ['健康规划师分配就医专员']);
});
test('parallel stages remain visible and blocked-only work is not portrayed as executable', () => {
  assert.equal(summarize(task, [row({ _id: 'a' }), row({ _id: 'b' })]).current.length, 2);
  const p = summarize(task, [row({ isBlocked: true })]); assert.equal(p.current[0].blocked, true); assert.match(p.message, /前置/);
});
test('unknown source and empty work never imply completion', () => {
  assert.equal(scope({ patientId: 'p' }), null); assert.match(summarize({}, []).message, /暂无/);
  assert.match(summarize(task, []).message, /暂无/);
});
