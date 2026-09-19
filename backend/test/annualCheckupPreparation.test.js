const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAnnualCheckupPreparation: build } = require('../src/utils/annualCheckupPreparation');
const { projectAnnualSchedule, matchesChange } = require('../src/utils/annualScheduleAmendments');
const patient = { _id: 'patient', assignedFamilyDoctor: 'advisor', assignedHealthPlanner: 'planner', assignedHealthManager: 'manager' };
const plan = { _id: 'annual', patientId: 'patient', createdBy: 'author', confirmedAt: '2026-09-01T00:00:00+08:00',
  pushedAt: '2026-08-31', reviewStatus: 'approved', moduleData: { annual_checkup: { enabled: true, date: '2026-10-03', serviceMode: 'managed' } } };
const gate = { allowed: true, anchor: plan.confirmedAt, access: { active: true, startDate: '2026-09-01', endDate: '2027-08-31' } };
const now = '2026-09-19T10:00:00+08:00';
const dated = date => ({ ...plan, moduleData: { annual_checkup: { ...plan.moduleData.annual_checkup, date } } });

test('恰好前14天生成两个独立并行候选，角色不落到健管专员', () => {
  const result = build(plan, patient, gate, now);
  assert.equal(result.state, 'due'); assert.equal(result.preparationDate, '2026-09-19');
  assert.deepEqual(result.tasks.map(row => row.assignedTo), ['advisor', 'planner']);
  assert.deepEqual(result.tasks.map(row => row.taskRole), ['executor', 'supervisor']);
  assert.equal(new Set(result.tasks.map(row => row.coordinationGroupId)).size, 2);
  for (const row of result.tasks) {
    assert.equal(row.sourceType, 'annual_service'); assert.equal(row.isBlocked, false);
    assert.equal(row.date.toISOString(), '2026-09-19T01:00:00.000Z');
    assert.equal(row.formData.serviceRequest, undefined);
    assert.equal(row.sourceOrderId, undefined); assert.equal(row.sourceHealthPlanId, undefined);
  }
});

test('前15天不提前铺设任务，按北京时间跨日进入窗口', () => {
  assert.equal(build(plan, patient, gate, '2026-09-18T15:59:59Z').state, 'waiting');
  assert.equal(build(plan, patient, gate, '2026-09-18T16:00:00Z').tasks.length, 2);
});

test('同一窗口多次扫描候选身份及时间不随扫描日漂移', () => {
  assert.deepEqual(build(plan, patient, gate, now), build(plan, patient, gate, '2026-09-23T12:00:00+08:00'));
});

test('不足14天才确认时立即准备，并标记紧临', () => {
  const late = { ...plan, confirmedAt: '2026-09-28T12:00:00+08:00' };
  const result = build(late, patient, { ...gate, anchor: late.confirmedAt }, '2026-09-28T13:00:00+08:00');
  assert.equal(result.state, 'due'); assert.equal(result.preparationDate, '2026-09-28');
  assert.equal(result.latePreparation, true); assert.equal(result.tasks.length, 2);
});

test('提前确认的续年从可信服务期起点开始准备，不落到旧期', () => {
  const renewal = { ...plan, confirmedAt: '2026-08-20', continuitySource: { previousPlanId: 'previous' },
    moduleData: { annual_checkup: { date: '2026-09-05' } } };
  const result = build(renewal, patient, { ...gate, period: { startDate: '2026-09-01', endDate: '2027-08-31' } }, '2026-09-01');
  assert.equal(result.preparationDate, '2026-09-01'); assert.equal(result.latePreparation, true);
});

test('过去的体检不批量补任务；当天仍可准备', () => {
  const past = build(dated('2026-09-18'), patient, gate, now);
  assert.equal(past.state, 'overdue'); assert.deepEqual(past.tasks, []);
  assert.equal(past.issues[0].code, 'checkup_overdue');
  assert.equal(build(dated('2026-09-19'), patient, gate, now).tasks.length, 2);
});

for (const patch of [{ confirmedAt: null }, { pushedAt: null }, { reviewStatus: 'pending' }, { reviewStatus: 'rejected' }]) {
  test(`未完成方案确认不准备：${JSON.stringify(patch)}`, () => {
    assert.equal(build({ ...plan, ...patch }, patient, gate, now).tasks.length, 0);
  });
}

test('到期/退款/未生效门槛不得由档案日期绕过，也不能只传allowed', () => {
  for (const closed of [null, { allowed: true }, { ...gate, allowed: false, reason: '凭据失效' }, { ...gate, access: { active: false } }]) {
    assert.equal(build(plan, patient, closed, now).tasks.length, 0);
  }
  assert.equal(build(plan, patient, { ...gate, anchor: '2026-10-01' }, now).tasks.length, 0);
});

test('服务期首尾日包含在内，越界与无效服务期明确阻断', () => {
  for (const date of ['2026-08-31', '2027-09-01']) {
    assert.equal(build(dated(date), patient, gate, now).issues[0].code, 'outside_period');
  }
  const first = build(dated('2026-09-01'), patient, gate, '2026-09-01');
  const last = build(dated('2027-08-31'), patient, gate, '2027-08-17');
  assert.equal(first.tasks.length, 2); assert.equal(last.tasks.length, 2);
  for (const access of [{ startDate: '2026-02-30' }, { endDate: 'invalid' }, { startDate: '2027-09-01', endDate: '2026-09-01' }]) {
    assert.equal(build(plan, patient, { ...gate, access: { ...gate.access, ...access } }, now).issues[0].code, 'invalid_period');
  }
});

test('缺少/无效/模糊日期不给猜测排期', () => {
  for (const date of ['', null, '2026年10月', '2026-02-30', '2026-10-03T00:00:00Z']) {
    const result = build(dated(date), patient, gate, now);
    assert.equal(result.state, 'blocked'); assert.equal(result.issues[0].code, 'invalid_date');
  }
});

test('跨年、闰年的提前14天按日历准确计算', () => {
  for (const [target, start] of [['2027-01-05', '2026-12-22'], ['2028-03-01', '2028-02-16']]) {
    const result = build(dated(target), patient, { ...gate, access: { active: true } }, start);
    assert.equal(result.preparationDate, start); assert.equal(result.tasks.length, 2);
  }
});

test('日期覆盖层改变实际排期，但保留冻结日期的任务键并纳入改期影响检查', () => {
  const projected = projectAnnualSchedule(plan, [{ moduleKey: 'annual_checkup', index: 0, field: 'date', from: '2026-10-03', to: '2026-10-04' }]);
  const result = build(plan, patient, { ...gate, executionPlan: projected }, '2026-09-20');
  assert.equal(result.targetDate, '2026-10-04'); assert.equal(result.preparationDate, '2026-09-20');
  for (const row of result.tasks) {
    assert.match(row.sourceScheduleKey, /^annual_checkup:2026-10-03:prepare:/);
    assert.equal(matchesChange(projected, { moduleKey: 'annual_checkup', index: 0, field: 'date', from: '2026-10-04' }, { kind: 'followup', scheduleKey: row.sourceScheduleKey }), true);
  }
});

test('未配置体检或明确关闭不生成，服务方式不影响两岗位准备', () => {
  assert.equal(build({ ...plan, moduleData: {} }, patient, gate, now).tasks.length, 0);
  assert.equal(build({ ...plan, moduleData: { annual_checkup: { enabled: false } } }, patient, gate, now).tasks.length, 0);
  for (const serviceMode of ['reminder', 'single', 'managed']) {
    assert.equal(build({ ...plan, moduleData: { annual_checkup: { date: '2026-10-03', serviceMode } } }, patient, gate, now).tasks.length, 2);
  }
});

test('缺岗不让健管或创建人冒充，也不丢失另一岗位的候选', () => {
  const result = build(plan, { ...patient, assignedFamilyDoctor: null }, gate, now);
  assert.deepEqual(result.tasks.map(row => row.assignedTo), ['planner']);
  assert.equal(result.issues[0].role, 'familyDoctor');
  assert.equal(result.issues[0].code, 'missing_assignment');
});

test('客户及有效方案必须匹配；不修改冻结方案和输入对象', () => {
  const before = JSON.stringify({ plan, patient, gate });
  assert.equal(build(plan, { ...patient, _id: 'other' }, gate, now).state, 'blocked');
  assert.equal(build(plan, patient, { ...gate, executionPlan: { ...plan, _id: 'other' } }, now).state, 'blocked');
  build(plan, patient, gate, now);
  assert.equal(JSON.stringify({ plan, patient, gate }), before);
});
