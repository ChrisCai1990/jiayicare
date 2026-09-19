const test = require('node:test');
const assert = require('node:assert/strict');
const { applyApprovedCorrection } = require('../src/utils/annualServicePeriodCorrectionApply');
const { correctionImpact, evidenceSnapshot } = require('../src/utils/annualServicePeriodCorrection');
const { annualExecutionGate } = require('../src/utils/annualServicePeriod');
const { resolveServiceAccess } = require('../src/utils/serviceAccess');
const { buildAnnualRenewalTodos, beginRenewalSync } = require('../src/utils/annualRenewalSyncState');
const clone = value => structuredClone(value);
async function setup() {
  const plan = { _id: 'plan', patientId: 'patient', year: 2027, confirmedAt: '2026-12-01', pushedAt: '2026-12-01', reviewStatus: 'approved', moduleData: {}, continuitySource: { previousPlanId: 'old' } };
  const state = { period: { _id: 'period', patientId: 'patient', annualPlanId: 'plan', sourceType: 'offline_contract', contractReference: 'old', startDate: '2027-01-01', endDate: '2027-12-31', confirmedAt: '2026-12-01', confirmedBy: 'planner', evidenceSnapshot: { verifiedByPlanner: true }, correctionRevision: 2, syncState: 'idle', correctionHistory: [] }, tasks: [], follows: [], supplies: [], overlap: null, duplicate: null, failApply: false, indexes: true };
  const models = {
    Period: {
      findOne: q => ({ lean: async () => clone(q.annualPlanId ? state.period : q.$or ? state.duplicate : state.overlap) }),
      find: () => ({ sort: () => ({ lean: async () => [clone(state.period)] }) }),
      init: async () => {}, collection: { indexes: async () => state.indexes ? [{ key: { evidenceOrderIds: 1 }, unique: true, sparse: true }] : [] },
      updateOne: async (q, u) => {
        const p = state.period;
        if (q.correctionRevision !== undefined && q.correctionRevision !== p.correctionRevision) return { matchedCount: 0 };
        if (q.$or && p.correctionRevision) return { matchedCount: 0 };
        if (q['correction.status'] && p.correction.status !== q['correction.status']) return { matchedCount: 0 };
        if (q.syncState?.$ne === p.syncState) return { matchedCount: 0 };
        if (state.failApply && u.$set?.startDate) throw Error('write failed');
        for (const [key, value] of Object.entries(u.$set || {})) {
          if (key === 'correction.applyIssue') p.correction.applyIssue = clone(value);
          else p[key] = clone(value);
        }
        for (const key of Object.keys(u.$unset || {})) delete p[key];
        p.correctionRevision += u.$inc?.correctionRevision || 0;
        if (u.$push) p.correctionHistory.push(clone(u.$push.correctionHistory));
        return { matchedCount: 1 };
      },
    },
    Order: { findById: id => ({ lean: async () => state.orderInvalid ? null : ({ _id: id, user: 'patient', orderType: 'package', paymentStatus: 'paid', serviceId: 'pkg_1y' }) }) },
    ...Object.fromEntries([['Task', 'tasks'], ['FollowUp', 'follows'], ['Supply', 'supplies']].map(([name, key]) => [name, { find: () => ({ select: () => ({ lean: async () => clone(state[key]) }) }) }])),
  };
  const proposed = { sourceType: 'offline_contract', contractReference: 'new', startDate: '2027-01-02', endDate: '2028-01-01', evidenceSnapshot: { verifiedByPlanner: true } };
  state.period.correction = { id: 'correction', status: 'approved_pending_apply', original: evidenceSnapshot(state.period), proposed, proposedBy: 'planner', reviewedBy: 'advisor', reviewedAt: new Date(), applicationPolicy: 'retain_schedule', impact: await correctionImpact(plan, proposed, models) };
  return { plan, state, models, apply: () => applyApprovedCorrection(plan, models) };
}
test('安全更正原子生效且保留原凭据；重复或并发应用只留一次记录', async () => {
  const s = await setup();
  const results = await Promise.all([s.apply(), s.apply()]);
  assert.equal(results.filter(r => r.applied).length, 1);
  assert.equal(s.state.period.startDate, '2027-01-02'); assert.equal(s.state.period.correction.original.startDate, '2027-01-01');
  assert.equal(s.state.period.correction.status, 'applied'); assert.equal(s.state.period.correctionHistory.length, 1);
  assert.equal((await s.apply()).applied, false);
});
test('执行起点不随更正漂移，后续派单键仍使用原起点', async () => {
  const s = await setup(); await s.apply();
  const gate = await annualExecutionGate(s.plan, new Date('2027-05-01'), s.models);
  assert.equal(gate.allowed, true); assert.equal(gate.anchor.toISOString(), '2026-12-31T16:00:00.000Z');
});
test('访问及监测共用解析器读取新的生效服务期', async () => {
  const s = await setup(); await s.apply();
  const access = await resolveServiceAccess({ _id: 'patient', serviceExpiry: '2020-01-01' }, new Date('2028-01-01T12:00:00+08:00'), s.models);
  assert.equal(access.active, true); assert.equal(access.endDate, '2028-01-01');
});
test('越界未执行任务阻断应用且产生顾问待办，不动原日期', async () => {
  const s = await setup(); s.state.tasks = [{ _id: 'task', status: 'pending', dueDate: '2027-01-01' }];
  const result = await s.apply();
  assert.equal(result.issue.role, 'familyDoctor'); assert.equal(s.state.period.startDate, '2027-01-01');
  const todos = buildAnnualRenewalTodos([{ ...s.plan, patientId: { _id: 'patient', assignedFamilyDoctor: 'advisor' } }], [s.state.period], { _id: 'advisor', role: 'familyDoctor' });
  assert.equal(todos.length, 1);
  await s.apply(); assert.equal(s.state.period.correctionHistory.length, 1);
});
test('已完成、进行中、已关联和人工停用记录原样保留', async () => {
  const s = await setup();
  s.state.tasks = [{ _id: 'done', status: 'completed', dueDate: '2027-01-01' }];
  s.state.follows = [{ _id: 'running', status: 'in_progress', date: '2027-01-01' }, { _id: 'linked', status: 'planned', date: '2027-01-01', serviceTracking: { linkId: 'service' } }];
  s.state.supplies = [{ _id: 'paused', workflowStatus: 'idle', enabled: false, nextDueDate: '2027-01-01' }];
  const before = clone([s.state.tasks, s.state.follows, s.state.supplies]);
  assert.equal((await s.apply()).applied, true); assert.deepEqual([s.state.tasks, s.state.follows, s.state.supplies], before);
});
test('审核后冻结方案日期改变或未入窗口相对排期越界均不应用', async () => {
  const s = await setup(); s.plan.moduleData.visit = { date: '2027-03-01' };
  assert.match((await s.apply()).issue.message, /日期发生变化/);
  const r = await setup(); r.plan.moduleData.personalized_followups = { records: [{ sourceCycles: [{ cycleDuration: 500, cycleUnit: 'day' }] }] };
  assert.match((await r.apply()).issue.message, /相对排期越界/);
});
test('无明确日期的服务需求不能借默认起点排到更正期之前', async () => {
  const s = await setup(); s.plan.moduleData.medical_treatment = { records: [{ serviceMode: 'managed', name: '待安排就医' }] };
  const result = await s.apply(); assert.equal(result.applied, false); assert.equal(result.issue.role, 'familyDoctor');
});
test('订单更换永久保留原订单引用，新旧订单均不可给其他周期复用', async () => {
  const s = await setup();
  Object.assign(s.state.period, { sourceType: 'paid_order', sourceOrderId: 'old-order' });
  s.state.period.correction.original = evidenceSnapshot(s.state.period);
  Object.assign(s.state.period.correction.proposed, { sourceType: 'paid_order', sourceOrderId: 'new-order' });
  assert.equal((await s.apply()).applied, true);
  assert.equal(s.state.period.sourceOrderId, 'new-order'); assert.deepEqual(s.state.period.evidenceOrderIds, ['old-order', 'new-order']);
});
test('已用订单、退款、服务期重叠不能应用，归规划师处理', async () => {
  for (const key of ['duplicate', 'orderInvalid', 'overlap']) {
    const s = await setup(); s.state.period.correction.proposed.sourceType = 'paid_order'; s.state.period.correction.proposed.sourceOrderId = 'new-order';
    s.state[key] = key === 'orderInvalid' ? true : { _id: 'another-period' };
    assert.equal((await s.apply()).issue.role, 'healthPlanner'); assert.equal(s.state.period.startDate, '2027-01-01');
  }
});
test('缺真实历史订单唯一索引时停止，补齐后可重试', async () => {
  const s = await setup(); Object.assign(s.state.period.correction.proposed, { sourceType: 'paid_order', sourceOrderId: 'new-order' });
  s.state.indexes = false; assert.equal((await s.apply()).applied, false);
  assert.equal(s.state.period.startDate, '2027-01-01');
  s.state.indexes = true; assert.equal((await s.apply()).applied, true);
});
test('暂时写入失败保留队列，重试成功后保留原审核身份', async () => {
  const s = await setup(); s.state.failApply = true;
  assert.equal((await s.apply()).applied, false); assert.equal(s.state.period.correction.status, 'approved_pending_apply');
  s.state.failApply = false; assert.equal((await s.apply()).applied, true);
  assert.equal(s.state.period.correction.reviewedBy, 'advisor'); assert.equal(s.state.period.correctionHistory.length, 2);
});
test('正在派发时不抢占；应用后旧门槛快照不能再启动同步', async () => {
  const s = await setup(); s.state.period.syncState = 'running';
  assert.equal((await s.apply()).waiting, true); assert.equal(s.state.period.correctionHistory.length, 0);
  const before = clone(s.state.period); s.state.period.syncState = 'idle'; await s.apply();
  await assert.rejects(beginRenewalSync(before, s.models.Period), /版本已变化/);
});
test('未审核或旧版仅审核不应用的申请不得自动生效', async () => {
  const s = await setup(); delete s.state.period.correction.applicationPolicy;
  assert.match((await s.apply()).issue.message, /历史审核/);
  s.state.period.correction.status = 'pending_review'; assert.equal((await s.apply()).applied, false);
});
