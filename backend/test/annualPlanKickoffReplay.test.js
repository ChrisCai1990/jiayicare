const test = require('node:test');
const assert = require('node:assert/strict');
const FollowUp = require('../src/models/FollowUp');
const Task = require('../src/models/Task');
const User = require('../src/models/User');
require('../src/utils/annualPlanFollowUps').syncAnnualPlanFollowUps = async () => 0;
require('../src/utils/annualPlanServiceTasks').syncAnnualPlanServiceTasks = async () => ({ warnings: [] });
const { syncAnnualPlanTaskSplit } = require('../src/utils/annualPlanTaskSplit');
test.beforeEach(t => {
  for (const Model of [Task, FollowUp]) {
    t.mock.method(Model, 'init', async () => Model);
    t.mock.method(Model.collection, 'indexes', async () => [{ key: { annualDispatchKey: 1 }, unique: true, sparse: true }]);
  }
});
for (const status of ['completed', 'cancelled', 'in_progress', 'missed', 'planned', null]) {
  test(`重复同步不重开任务：${status || '首次创建'}`, async t => {
    let row = status ? { status, assignedTo: 'original', executedContent: '原执行记录' } : null;
    t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'current' }) }) }));
    t.mock.method(FollowUp, 'deleteMany', async () => ({}));
    t.mock.method(Task, 'updateOne', async () => ({ upsertedCount: 0 }));
    t.mock.method(FollowUp, 'updateOne', async (filter, update, options) => {
      if (update.$set) {
        assert.deepEqual(filter.status.$in, ['planned', 'in_progress', 'missed']); assert.equal(options?.upsert, undefined);
        assert.equal(update.$set.status, undefined);
        if (row && filter.status.$in.includes(row.status)) Object.assign(row, update.$set);
      } else if (!row) { row = { ...update.$setOnInsert }; return { upsertedCount: 1 }; }
      return { upsertedCount: 0 };
    });
    const plan = { _id: 'plan', patientId: 'patient', year: 2026, confirmedAt: new Date('2026-09-19') };
    await syncAnnualPlanTaskSplit(plan); await syncAnnualPlanTaskSplit(plan);
    assert.equal(row.status, status || 'planned');
    if (['completed', 'cancelled'].includes(status)) { assert.equal(row.assignedTo, 'original'); assert.equal(row.executedContent, '原执行记录'); }
    else assert.equal(row.assignedTo, 'current');
  });
}
test('续年部分失败进入恢复状态，重试成功；迟到失败不能覆盖成功', async t => {
  const Period = require('../src/models/AnnualServicePeriod');
  const gate = require('../src/utils/annualServicePeriod');
  let failure = true; let state = 'waiting'; let attemptId; let issue;
  t.mock.method(gate, 'annualExecutionGate', async () => ({ allowed: true, anchor: new Date('2027-01-01'), period: { _id: 'period', activationStatus: state } }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner', assignedHealthManager: 'manager' }) }) }));
  t.mock.method(FollowUp, 'deleteMany', async () => ({}));
  t.mock.method(FollowUp, 'updateOne', async () => ({ upsertedCount: 0 }));
  t.mock.method(Task, 'updateOne', async () => { if (failure) throw Error('暂时写入失败'); return { upsertedCount: 0 }; });
  t.mock.method(require('../src/utils/annualPlanSupplyPlans'), 'syncAnnualPlanSupplyPlans', async () => ({}));
  t.mock.method(require('../src/utils/annualPlanTreatmentSync'), 'syncAnnualPlanTreatments', async () => ({}));
  t.mock.method(Period, 'updateOne', async (filter, update) => {
    if (update.$set.syncAttemptId) { attemptId = update.$set.syncAttemptId; return { matchedCount: 1 }; }
    assert.equal(filter.syncAttemptId, attemptId);
    if (filter.activationStatus?.$ne === state) return { matchedCount: 0 };
    if (update.$set.activationStatus) state = update.$set.activationStatus;
    if ('syncIssue' in update.$set) issue = update.$set.syncIssue;
    return { matchedCount: 1 };
  });
  const plan = { _id: 'plan', patientId: 'patient', year: 2027, confirmedAt: new Date('2026-12-01'), continuitySource: { previousPlanId: 'old' } };
  await assert.rejects(syncAnnualPlanTaskSplit(plan)); assert.equal(state, 'failed');
  failure = false; await syncAnnualPlanTaskSplit(plan); assert.equal(state, 'active');
  failure = true; await assert.rejects(syncAnnualPlanTaskSplit(plan)); assert.equal(state, 'active');
  assert.equal(issue.code, 'sync_failed');
  assert.equal(plan.confirmedAt.toISOString(), '2026-12-01T00:00:00.000Z');
});
test('续年缺岗位不能标记激活完成，待办保留异常提示', async t => {
  let state;
  t.mock.method(require('../src/utils/annualServicePeriod'), 'annualExecutionGate', async () => ({ allowed: true, anchor: new Date('2027-01-01'), period: { _id: 'period' } }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({}) }) }));
  t.mock.method(FollowUp, 'deleteMany', async () => ({}));
  t.mock.method(Task, 'updateOne', async () => ({ upsertedCount: 0 }));
  t.mock.method(require('../src/utils/annualPlanSupplyPlans'), 'syncAnnualPlanSupplyPlans', async () => ({}));
  t.mock.method(require('../src/utils/annualPlanTreatmentSync'), 'syncAnnualPlanTreatments', async () => ({}));
  t.mock.method(require('../src/models/AnnualServicePeriod'), 'updateOne', async (filter, update) => { if (update.$set.activationStatus) state = update.$set.activationStatus; return { matchedCount: 1 }; });
  const result = await syncAnnualPlanTaskSplit({ _id: 'plan', patientId: 'patient', confirmedAt: new Date(), continuitySource: { previousPlanId: 'old' } });
  assert.equal(state, 'failed'); assert.equal(result.warnings.length, 2);
});
test('日期等门槛异常持久交顾问，修复后正常等待不生成额外任务', async t => {
  let state; let issue = { code: 'plan_dates', role: 'familyDoctor', message: '排期超出服务期' };
  t.mock.method(require('../src/utils/annualServicePeriod'), 'annualExecutionGate', async () => ({ allowed: false, period: { _id: 'period' }, reason: '暂不可派发', issue }));
  t.mock.method(require('../src/models/AnnualServicePeriod'), 'updateOne', async (q, u) => { if (u.$set.syncState && u.$set.syncState !== 'running') state = u.$set; return { matchedCount: 1 }; });
  t.mock.method(Task, 'updateOne', async () => assert.fail('门槛未满足不能派任务'));
  const plan = { _id: 'plan', confirmedAt: new Date(), continuitySource: { previousPlanId: 'old' } };
  await syncAnnualPlanTaskSplit(plan);
  assert.equal(state.syncState, 'blocked'); assert.equal(state.syncIssue.role, 'familyDoctor');
  issue = null;
  await syncAnnualPlanTaskSplit(plan);
  assert.equal(state.syncState, 'idle'); assert.equal(state.syncIssue, null);
});
