const test = require('node:test');
const assert = require('node:assert/strict');
const { beginRenewalSync, finishRenewalSync, buildAnnualRenewalTodos } = require('../src/utils/annualRenewalSyncState');
test('同步不抢占未结束尝试；旧尝试迟到写回不能覆盖新状态', async () => {
  const record = { _id: 'period', activationStatus: 'waiting' };
  const Model = { updateOne: async (filter, update) => {
    if (filter.syncState?.$ne === record.syncState) return { matchedCount: 0 };
    if (filter.syncAttemptId && filter.syncAttemptId !== record.syncAttemptId) return { matchedCount: 0 };
    if (filter.activatedAt === null && record.activatedAt) return { matchedCount: 0 };
    if (filter.activationStatus?.$ne === record.activationStatus) return { matchedCount: 0 };
    Object.assign(record, update.$set); return { matchedCount: 1 };
  } };
  const first = await beginRenewalSync(record, Model);
  await assert.rejects(beginRenewalSync(record, Model), /同步尚未结束/);
  await finishRenewalSync(record, first, {}, Model);
  const second = await beginRenewalSync(record, Model);
  assert.notEqual(first, second);
  await finishRenewalSync(record, second, {}, Model);
  await finishRenewalSync(record, first, { issue: { code: 'old_failure' } }, Model);
  assert.equal(record.activationStatus, 'active'); assert.equal(record.syncIssue, null);
  const third = await beginRenewalSync(record, Model);
  await finishRenewalSync(record, third, { issue: { role: 'healthPlanner', code: 'sync_failed' } }, Model);
  assert.equal(record.activationStatus, 'active'); assert.equal(record.syncState, 'failed'); assert.equal(record.syncIssue.code, 'sync_failed');
});
const patient = { _id: 'patient', name: '客户', assignedHealthPlanner: 'planner', assignedFamilyDoctor: 'advisor' };
const plans = [{ _id: 'plan', year: 2027, patientId: patient, planType: 'health_prevention' }];
const actor = (role, id) => ({ role, _id: id });
test('异常按岗位归属，不泄露给其他客户人员；正常未来服务期不制造任务', () => {
  assert.equal(buildAnnualRenewalTodos(plans, [], actor('healthPlanner', 'planner')).length, 1);
  assert.equal(buildAnnualRenewalTodos(plans, [], actor('familyDoctor', 'advisor')).length, 0);
  assert.equal(buildAnnualRenewalTodos(plans, [{ annualPlanId: 'plan', activationStatus: 'waiting' }], actor('healthPlanner', 'planner')).length, 0);
  const rows = [{ annualPlanId: 'plan', syncIssue: { role: 'familyDoctor', message: '请核对方案日期' } }];
  assert.equal(buildAnnualRenewalTodos(plans, rows, actor('familyDoctor', 'advisor')).length, 1);
  assert.equal(buildAnnualRenewalTodos(plans, rows, actor('familyDoctor', 'other')).length, 0);
  assert.equal(buildAnnualRenewalTodos(plans, rows, actor('healthPlanner', 'planner')).length, 0);
  assert.equal(buildAnnualRenewalTodos(plans, rows, actor('superadmin', 'super')).length, 1);
});
test('同步进程中断保留可恢复工作台入口，旧失败记录兼容', () => {
  const now = new Date('2027-01-01T12:00:00Z');
  const row = { annualPlanId: 'plan', syncState: 'running', syncStartedAt: new Date('2027-01-01T11:00:00Z') };
  const todos = buildAnnualRenewalTodos(plans, [row], actor('healthPlanner', 'planner'), now);
  assert.equal(todos.length, 1); assert.match(todos[0].summary, /中断/);
  assert.equal(buildAnnualRenewalTodos(plans, [{ annualPlanId: 'plan', activationStatus: 'failed' }], actor('healthPlanner', 'planner')).length, 1);
});
test('服务到期等正常等待清除已修复异常，不清除历史首次启用时间', async () => {
  const period = { _id: 'p', activatedAt: new Date(), activationStatus: 'active' }; let fields;
  await finishRenewalSync(period, 'attempt', { allowed: false }, { updateOne: async (q, u) => { if (!q.activatedAt && !q.activationStatus) fields = u.$set; return { matchedCount: q.activationStatus ? 0 : 1 }; } });
  assert.equal(fields.activationStatus, undefined); assert.equal(fields.syncIssue, null); assert.equal(fields.activatedAt, undefined);
});
test('门槛旧快照为未启用时，也不能把数据库里已成功的启用状态降级', async () => {
  const activatedAt = new Date('2027-01-01');
  const record = { syncAttemptId: 'latest', activationStatus: 'active', activatedAt };
  const Model = { updateOne: async (q, u) => {
    if (q.activatedAt === null && record.activatedAt) return { matchedCount: 0 };
    Object.assign(record, u.$set); return { matchedCount: 1 };
  } };
  await finishRenewalSync({ _id: 'period', activationStatus: 'waiting' }, 'latest', { issue: { code: 'sync_failed' } }, Model);
  assert.equal(record.activationStatus, 'active'); assert.equal(record.activatedAt, activatedAt); assert.equal(record.syncState, 'failed');
});
