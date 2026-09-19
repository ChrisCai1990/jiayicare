const test = require('node:test');
const assert = require('node:assert/strict');
const { projectAnnualSchedule, validateScheduleChanges, mergeScheduleAmendments, assertAmendedRowUnchanged } = require('../src/utils/annualScheduleAmendments');
const { buildAnnualPlanServiceTasks } = require('../src/utils/annualPlanServiceTasks');
const { buildAnnualPlanFollowUps } = require('../src/utils/annualPlanFollowUps');
const User = require('../src/models/User');
const Admin = require('../src/models/Admin');
const hm = '000000000000000000000001';
const change = { moduleKey: 'medical_treatment', index: 0, field: 'visit_time', from: '2027-01-01', to: '2027-03-01' };
const period = { startDate: '2027-01-02', endDate: '2028-01-01' };
const plan = () => ({ _id: 'plan', patientId: 'patient', createdBy: hm, confirmedAt: '2026-12-01', moduleData: { medical_treatment: { records: [{ visit_time: change.from, hospital: '医院', serviceMode: 'managed' }] } } });
test('固定日期投影保留冻结方案，重复投影不累计修改', () => {
  const original = plan(); const before = structuredClone(original);
  const projected = projectAnnualSchedule(original, [change]);
  assert.equal(projected.moduleData.medical_treatment.records[0].visit_time, change.to);
  assert.deepEqual(original, before);
  assert.deepEqual(projectAnnualSchedule(projected, [change]).moduleData, projected.moduleData);
  assert.equal(projectAnnualSchedule(projected, []).moduleData.medical_treatment.records[0].visit_time, change.from);
});
test('确认接口传入Mongoose文档时仍返回完整可派发方案而非内部_doc', () => {
  const AnnualPlan = require('../src/models/AnnualPlan');
  const doc = new AnnualPlan({ patientId: hm, year: 2027, moduleData: plan().moduleData, confirmedAt: '2027-01-01' });
  const projected = projectAnnualSchedule(doc);
  assert.equal(projected.year, 2027); assert.equal(String(projected.patientId), hm); assert.equal(projected._doc, undefined);
  const amended = projectAnnualSchedule(doc, [change]);
  assert.equal(amended.moduleData.medical_treatment.records[0].visit_time, change.to);
});
test('修订日期正确，但服务需求派单键与原冻结日期一致', () => {
  const original = plan(), projected = projectAnnualSchedule(original, [change]);
  const before = buildAnnualPlanServiceTasks(original, { assignedHealthPlanner: 'planner' })[0];
  const after = buildAnnualPlanServiceTasks(projected, { assignedHealthPlanner: 'planner' })[0];
  assert.equal(after.key, before.key); assert.equal(after.date.toISOString().slice(0, 10), change.to);
  assert.equal(after.formData.serviceRequest.itemSnapshot.visit_time, change.to);
});
test('健管随访同样使用新日期及旧稳定键，年度体检也适用', async t => {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthManager: hm }) }) }));
  t.mock.method(Admin, 'find', () => ({ select: () => ({ lean: async () => [{ _id: hm, name: '健管' }] }) }));
  const original = plan(); original.moduleData.annual_checkup = { date: '2027-01-01' };
  const amendments = [change, { moduleKey: 'annual_checkup', index: 0, field: 'date', from: '2027-01-01', to: '2027-04-01' }];
  const before = await buildAnnualPlanFollowUps(original);
  const after = await buildAnnualPlanFollowUps(projectAnnualSchedule(original, amendments));
  assert.deepEqual(after.map(x => x.sourceScheduleKey), before.map(x => x.sourceScheduleKey));
  assert.deepEqual(after.map(x => x.date.toISOString().slice(0, 10)), ['2027-03-01', '2027-04-01']);
});
test('未知字段、非法日期、错误原日期、重复项及越界一律拒绝', () => {
  for (const patch of [{ moduleKey: '__proto__' }, { field: 'assignedTo' }, { index: -1 }, { from: '2027-02-01' }, { to: '2027-02-30' }, { to: '2029-01-01' }]) assert.throws(() => validateScheduleChanges(plan(), [{ ...change, ...patch }], period, { records: [] }));
  assert.throws(() => validateScheduleChanges(plan(), [change, change], period, { records: [] }), /重复/);
  assert.throws(() => validateScheduleChanges(plan(), {}, period, { records: [] }), /列表/);
});
test('已派发、取消、完成、已关联及无稳定键的历史记录均拦截', () => {
  for (const status of ['planned', 'completed', 'cancelled', 'in_progress']) {
    for (const scheduleKey of ['medical_treatment:2027-01-01:医院', 'service-request:medical_treatment:0:2027-01-01', 'medical_treatment:0', '']) {
      assert.throws(() => validateScheduleChanges(plan(), [change], period, { records: [{ kind: 'followup', status, scheduleKey }] }), /已有派发/);
    }
  }
});
test('其他事项的任务不会误阻断未派发事项', () => {
  assert.equal(validateScheduleChanges(plan(), [change], period, { records: [{ kind: 'followup', scheduleKey: 'annual_coordination' }, { kind: 'task' }] }).length, 1);
});
test('多次修订同一事项只更新有效日期，冻结来源保持不变', () => {
  const next = { ...change, from: change.to, to: '2027-05-01' };
  const merged = mergeScheduleAmendments([change], [next]);
  assert.equal(merged.length, 1);
  const projected = projectAnnualSchedule(plan(), merged);
  assert.equal(projected.__frozenModuleData.medical_treatment.records[0].visit_time, change.from);
  assert.equal(projected.moduleData.medical_treatment.records[0].visit_time, next.to);
});
test('迟到旧日期任务触发异常，不自动覆盖或改变派单键', () => {
  const projected = projectAnnualSchedule(plan(), [change]);
  assert.throws(() => assertAmendedRowUnchanged(projected, 'medical_treatment:2027-01-01:医院', change.from, change.to), { code: 'ANNUAL_SCHEDULE_CONFLICT' });
  assert.doesNotThrow(() => assertAmendedRowUnchanged(projected, 'medical_treatment:2027-01-01:医院', change.to, change.to));
});
