const test = require('node:test');
const assert = require('node:assert/strict');
const { applyApprovedCorrection } = require('../src/utils/annualServicePeriodCorrectionApply');
const { correctionImpact, evidenceSnapshot } = require('../src/utils/annualServicePeriodCorrection');
const { buildMoves } = require('../src/utils/annualIssuedScheduleCorrection');
const { startAnnualServiceLink } = require('../src/utils/annualServiceLinkStart');
const clone = value => structuredClone(value);
const change = { moduleKey: 'medical_treatment', index: 0, field: 'visit_time', from: '2027-01-01', to: '2027-03-01' };
const get = (obj, key) => key.split('.').reduce((value, part) => value?.[part], obj);
const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
function match(row, query) {
  return Object.entries(query).every(([key, value]) => {
    const actual = get(row, key);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('$ne' in value) return !equal(actual, value.$ne);
      if ('$in' in value) return value.$in.some(item => equal(actual, item));
    }
    return equal(actual, value);
  });
}
function set(row, key, value) {
  const keys = key.split('.'); let obj = row;
  for (const part of keys.slice(0, -1)) obj = obj[part] ||= {};
  obj[keys.at(-1)] = clone(value);
}
async function setup() {
  const plan = { _id: 'plan', patientId: 'patient', year: 2027, confirmedAt: '2026-12-01', continuitySource: { previousPlanId: 'old' }, moduleData: { medical_treatment: { records: [{ visit_time: change.from, hospital: '医院', serviceMode: 'managed' }] } } };
  const common = { patientId: 'patient', sourceAnnualPlanId: 'plan', status: 'planned', date: new Date(change.from), updatedAt: new Date('2026-12-01'), content: '原内容', assignedTo: 'owner' };
  const state = { period: { _id: 'period', patientId: 'patient', annualPlanId: 'plan', sourceType: 'offline_contract', contractReference: 'old', startDate: '2027-01-01', endDate: '2027-12-31', confirmedAt: new Date('2026-12-01'), evidenceSnapshot: { verifiedByPlanner: true }, correctionRevision: 2, syncState: 'idle', correctionHistory: [] }, follows: [
    { ...common, _id: 'follow', sourceType: 'scheduled', sourceScheduleKey: 'medical_treatment:2027-01-01:医院', remindAt: new Date('2026-12-31') },
    { ...common, _id: 'request', sourceType: 'annual_service', sourceScheduleKey: 'service-request:medical_treatment:0:2027-01-01', formData: { serviceRequest: { moduleKey: change.moduleKey, recordIndex: 0, itemSnapshot: clone(plan.moduleData.medical_treatment.records[0]) } } },
  ], transactions: 0, ended: 0 };
  let session;
  const query = read => ({ session(value) { assert.equal(value, session); return this; }, select() { return this; }, lean: async () => clone(read()) });
  const update = (row, q, u) => {
    if (!match(row, q)) return { matchedCount: 0 };
    for (const [key, value] of Object.entries(u.$set || {})) set(row, key, value);
    for (const key of Object.keys(u.$unset || {})) delete row[key];
    for (const [key, value] of Object.entries(u.$inc || {})) row[key] = (row[key] || 0) + value;
    for (const [key, value] of Object.entries(u.$push || {})) (row[key] ||= []).push(clone(value));
    return { matchedCount: 1 };
  };
  const models = {
    Period: {
      findOne: q => query(() => q.annualPlanId || q._id === 'period' ? state.period : null),
      updateOne: async (q, u, opts) => {
        if (opts) assert.equal(opts.session, session);
        if (state.failFinal && u.$set?.startDate) throw new Error('write failed');
        return update(state.period, q, u);
      },
    },
    FollowUp: {
      find: () => query(() => state.follows),
      updateOne: async (q, u, opts) => {
        assert.equal(opts.session, session);
        if (state.failSecond && q._id === 'request') return { matchedCount: 0 };
        return update(state.follows.find(row => row._id === q._id), q, u);
      },
    },
    Task: { find: () => query(() => []) }, Supply: { find: () => query(() => []) }, Order: {},
    Link: { findOne: () => query(() => state.link || null) },
    startSession: async () => (session = {
      withTransaction: async (fn, opts) => {
        state.transactions++; assert.equal(opts.readConcern.level, 'snapshot'); assert.equal(opts.writeConcern.w, 'majority');
        const snapshot = clone({ period: state.period, follows: state.follows });
        try { if (state.unsupported) throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member'), { code: 20 }); return await fn(); }
        catch (error) { Object.assign(state, snapshot); throw error; }
      },
      endSession: async () => { state.ended++; },
    }),
  };
  const proposed = { sourceType: 'offline_contract', contractReference: 'new', startDate: '2027-01-02', endDate: '2028-01-01', evidenceSnapshot: { verifiedByPlanner: true } };
  state.period.correction = { id: 'correction', status: 'approved_pending_apply', original: evidenceSnapshot(state.period), proposed, proposedBy: 'planner', reviewedBy: 'advisor', reviewedAt: new Date(), reviewNote: '合同日期更正，同步调整尚未开始的事项', applicationPolicy: 'revise_planned_fixed', scheduleChanges: [change], impact: await correctionImpact(plan, proposed, models) };
  return { plan, state, models, apply: () => applyApprovedCorrection(plan, models), refresh: async () => { state.period.correction.impact = await correctionImpact(plan, proposed, models); } };
}

test('事务同时改凭据、随访、服务需求和审计；原任务身份及冻结方案不变', async () => {
  const s = await setup(); const before = clone(s.plan);
  const result = await s.apply(); assert.equal(result.applied, true); assert.equal(result.movedTasks, 2);
  assert.deepEqual(s.plan, before); assert.equal(s.state.period.startDate, '2027-01-02');
  for (const row of s.state.follows) {
    assert.equal(row.date.toISOString().slice(0, 10), change.to); assert.equal(row.status, 'planned'); assert.equal(row.content, '原内容');
    assert.equal(row.annualScheduleHistory.length, 1); assert.equal(row.annualScheduleHistory[0].reviewedBy, 'advisor');
  }
  assert.equal(s.state.follows[0].remindAt.toISOString().slice(0, 10), '2027-02-28');
  assert.equal(s.state.follows[1].formData.serviceRequest.itemSnapshot.visit_time, change.to);
  assert.equal(s.state.follows[1].sourceScheduleKey, 'service-request:medical_treatment:0:2027-01-01');
  assert.equal((await s.apply()).applied, false); assert.equal(s.state.transactions, 1); assert.equal(s.state.ended, 1);
});
test('第二条任务或最终凭据写入失败时，第一条任务日期及审计一起回滚', async () => {
  for (const failure of ['failSecond', 'failFinal']) {
    const s = await setup(); const before = clone(s.state.follows); s.state[failure] = true;
    assert.equal((await s.apply()).applied, false); assert.deepEqual(s.state.follows, before);
    assert.equal(s.state.period.startDate, '2027-01-01'); assert.equal(s.state.period.correction.status, 'approved_pending_apply');
    s.state[failure] = false; assert.equal((await s.apply()).applied, true);
    assert.equal(s.state.follows[0].annualScheduleHistory.length, 1);
  }
});
test('单机数据库拒绝事务时不降级为逐条修改，留下规划师异常且可重试', async () => {
  const s = await setup(); s.state.unsupported = true; const before = clone(s.state.follows);
  const result = await s.apply(); assert.equal(result.issue.role, 'healthPlanner'); assert.match(result.issue.message, /不支持多文档事务/);
  assert.deepEqual(s.state.follows, before); assert.equal(s.state.period.startDate, '2027-01-01');
  s.state.unsupported = false; assert.equal((await s.apply()).applied, true);
});
test('审核后开始执行、完成、取消、改期或仅版本变化均需重新审核', async () => {
  for (const patch of [{ status: 'in_progress' }, { status: 'completed' }, { status: 'cancelled' }, { date: new Date('2027-01-03') }, { updatedAt: new Date() }]) {
    const s = await setup(); Object.assign(s.state.follows[0], patch); const before = clone(s.state.follows);
    assert.match((await s.apply()).issue.message, /重新审核/); assert.deepEqual(s.state.follows, before);
  }
});
test('待执行但已有执行痕迹、依赖或实际关联，仍不允许改期', async () => {
  for (const patch of [{ executedContent: '已沟通' }, { completedByUser: true }, { vitals: { weight: 65 } }, { nextFollowUpDate: new Date() }, { dependsOnTaskId: 'first' }, { formData: { execution: '结果' } }]) {
    const s = await setup(); Object.assign(s.state.follows[0], patch); await s.refresh();
    assert.equal((await s.apply()).applied, false);
  }
  const s = await setup(); s.state.link = { _id: 'not-yet-projected' };
  assert.match((await s.apply()).issue.message, /投影未同步/);
});
test('旧键、重复任务、同日同名事项及错客户不猜测映射', async () => {
  const s = await setup();
  assert.throws(() => buildMoves(s.plan, [change], [{ ...s.state.follows[0], sourceScheduleKey: 'medical_treatment:0' }]), /无法精确对应/);
  assert.throws(() => buildMoves(s.plan, [change], [s.state.follows[0], s.state.follows[0]]), /无法精确对应/);
  assert.throws(() => buildMoves(s.plan, [change], [{ ...s.state.follows[0], patientId: 'other' }]), /版本已变化/);
  s.plan.moduleData.medical_treatment.records.push(clone(s.plan.moduleData.medical_treatment.records[0]));
  assert.throws(() => buildMoves(s.plan, [change], s.state.follows), /无法唯一对应/);
});
test('正在同步时不启动事务；已审核无现存任务仍以相同原子路径处理', async () => {
  const s = await setup(); s.state.period.syncState = 'running';
  assert.equal((await s.apply()).waiting, true); assert.equal(s.state.transactions, 0);
  s.state.period.syncState = 'idle'; s.state.follows = []; await s.refresh();
  assert.equal((await s.apply()).applied, true);
});
test('年度服务关联在创建关联前以日期及版本条件标记两端为已开始', async () => {
  const s = await setup(); const writes = [];
  await startAnnualServiceLink(s.state.follows[1], s.state.follows[0], { updateOne: async (q, u) => { writes.push({ q, u }); return { matchedCount: 1 }; } });
  assert.equal(writes.length, 2);
  for (const { q, u } of writes) { assert.ok(q.updatedAt); assert.ok(q.date); assert.equal(u.$set.status, 'in_progress'); }
});
test('服务关联遇到已改期任务停止；非年度原链路不增加写操作', async () => {
  const s = await setup();
  await assert.rejects(startAnnualServiceLink(s.state.follows[1], s.state.follows[0], { updateOne: async () => ({ matchedCount: 0 }) }), /已改期/);
  await startAnnualServiceLink({}, {}, { updateOne: () => { throw new Error('不应写'); } });
});
test('年度体检日期同样精确映射，非目标已完成随访不受影响', async () => {
  const s = await setup();
  s.plan.moduleData = { annual_checkup: { date: change.from } };
  const checkup = { moduleKey: 'annual_checkup', index: 0, field: 'date', from: change.from, to: change.to };
  const row = { ...s.state.follows[0], sourceScheduleKey: 'annual_checkup:2027-01-01' };
  const untouched = { ...s.state.follows[0], status: 'completed' };
  const moves = buildMoves(s.plan, [checkup], [row, untouched]);
  assert.equal(moves.length, 1); assert.equal(moves[0].row.sourceScheduleKey, row.sourceScheduleKey);
});
