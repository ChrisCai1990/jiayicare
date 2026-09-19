const test = require('node:test');
const assert = require('node:assert/strict');
const { proposeCorrection, reviewCorrection, refreshCorrectionImpact, withdrawCorrection, correctionImpact } = require('../src/utils/annualServicePeriodCorrection');
const { buildAnnualRenewalTodos } = require('../src/utils/annualRenewalSyncState');
const clone = value => structuredClone(value);
test('已派发待执行改期需要顾问显式选择新策略，审核仍只保存草稿', async () => {
  const s = setup();
  s.plan.moduleData = { medical_treatment: { records: [{ visit_time: '2027-03-01', hospital: '医院' }] } };
  s.state.followups = [{ _id: 'follow', status: 'planned', date: '2027-03-01', sourceScheduleKey: 'medical_treatment:2027-03-01:医院', updatedAt: new Date('2027-01-01') }];
  await s.propose();
  const changes = [{ moduleKey: 'medical_treatment', index: 0, field: 'visit_time', from: '2027-03-01', to: '2027-04-01' }];
  await assert.rejects(s.review({ applicationPolicy: 'revise_unissued_fixed', scheduleChanges: changes, note: '更正日期' }), /已有派发/);
  await assert.rejects(s.review({ applicationPolicy: 'revise_planned_fixed', scheduleChanges: changes }), /审核原因/);
  const result = await s.review({ applicationPolicy: 'revise_planned_fixed', scheduleChanges: changes, note: '更正日期' });
  assert.equal(result.correction.status, 'approved_pending_apply');
  assert.equal(result.correction.applicationPolicy, 'revise_planned_fixed');
  assert.equal(s.state.followups[0].date, '2027-03-01');
});
function setup() {
  const plan = { _id: 'plan', patientId: 'patient', year: 2027, confirmedAt: '2026-12-01', continuitySource: { previousPlanId: 'old' }, moduleData: { visit: { records: [{ date: '2027-01-02' }] } } };
  const patient = { _id: 'patient', assignedHealthPlanner: 'planner', assignedFamilyDoctor: 'advisor' };
  const period = { _id: 'period', patientId: 'patient', annualPlanId: 'plan', sourceType: 'offline_contract', contractReference: 'original', startDate: '2027-01-01', endDate: '2027-12-31', confirmedAt: '2026-12-01', confirmedBy: 'planner', evidenceSnapshot: { verifiedByPlanner: true } };
  const state = { period, overlap: null, duplicate: null, updates: [], taskRows: [], followups: [], supplies: [], failWrite: false, order: null };
  const models = {
    Period: {
      findOne: q => ({ lean: async () => clone(q.annualPlanId ? state.period : q.sourceOrderId ? state.duplicate : state.overlap) }),
      updateOne: async (q, u) => {
        const revision = state.period.correctionRevision || 0;
        if (state.failWrite || (q.correctionRevision !== undefined ? q.correctionRevision !== revision : revision !== 0)) return { matchedCount: 0 };
        state.updates.push(clone(u));
        Object.assign(state.period, clone(u.$set)); state.period.correctionRevision = revision + u.$inc.correctionRevision;
        (state.period.correctionHistory ||= []).push(clone(u.$push.correctionHistory));
        return { matchedCount: 1 };
      },
    },
    Order: { findById: () => ({ lean: async () => clone(state.order) }) },
    ...Object.fromEntries([['Task', 'taskRows'], ['FollowUp', 'followups'], ['Supply', 'supplies']].map(([name, key]) => [name, { find: q => { assert.equal(q.sourceAnnualPlanId, 'plan'); return { select: () => ({ lean: async () => clone(state[key]) }) }; } }])),
  };
  const planner = { _id: 'planner', role: 'healthPlanner' }, advisor = { _id: 'advisor', role: 'familyDoctor' };
  const input = { expectedRevision: 0, sourceType: 'offline_contract', contractReference: 'corrected', startDate: '2027-02-01', endDate: '2028-01-31', verified: true, reason: '核对合同日期' };
  const propose = patch => proposeCorrection({ plan, patient, staff: planner, input: { ...input, ...patch } }, models);
  const review = patch => reviewCorrection({ plan, patient, staff: advisor, input: { expectedRevision: state.period.correctionRevision, correctionId: state.period.correction?.id, decision: 'approve', impactAcknowledged: true, applicationPolicy: 'retain_schedule', ...patch } }, models);
  return { plan, patient, state, models, planner, advisor, input, propose, review };
}
test('提交保留原生效凭据及冻结方案，只写更正快照和审计', async () => {
  const s = setup(); const original = clone(s.state.period); const originalPlan = clone(s.plan);
  s.state.followups = [{ _id: 'done', status: 'completed', date: '2027-01-02' }];
  const result = await s.propose();
  assert.equal(result.correction.status, 'pending_review'); assert.equal(result.correctionRevision, 1);
  for (const [key, value] of Object.entries(original)) assert.deepEqual(s.state.period[key], value);
  assert.deepEqual(s.plan, originalPlan);
  assert.equal(result.correction.impact.records[0].preserve, true);
  assert.equal(result.correction.impact.records[0].outsidePeriod, true);
  assert.equal(result.correction.impact.planDates[0].outsidePeriod, true);
  assert.equal(s.state.period.correctionHistory[0].action, 'submitted');
});
test('提交和审核严格区分岗位及客户归属，超管沿用既有权限', async () => {
  const s = setup();
  for (const staff of [s.advisor, { _id: 'other', role: 'healthPlanner' }, { _id: 'planner', role: 'healthManager' }]) {
    await assert.rejects(proposeCorrection({ plan: s.plan, patient: s.patient, staff, input: s.input }, s.models), { statusCode: 403 });
  }
  await s.propose();
  await assert.rejects(reviewCorrection({ plan: s.plan, patient: s.patient, staff: s.planner, input: {} }, s.models), { statusCode: 403 });
  await assert.rejects(reviewCorrection({ plan: s.plan, patient: s.patient, staff: { _id: 'other', role: 'familyDoctor' }, input: {} }, s.models), { statusCode: 403 });
});
test('非法日期、未核验、缺原因、无变化均不能提交', async () => {
  const s = setup();
  for (const patch of [{ startDate: '2027-02-30' }, { verified: false }, { reason: '' }, { startDate: '2027-01-01', endDate: '2027-12-31', contractReference: 'original' }]) await assert.rejects(s.propose(patch));
  assert.equal(s.state.updates.length, 0);
});
test('相邻年度重叠或订单不合格不能进入审核', async () => {
  const s = setup(); s.state.overlap = { _id: 'next' };
  await assert.rejects(s.propose(), /重叠/); s.state.overlap = null;
  await assert.rejects(s.propose({ sourceType: 'paid_order', sourceOrderId: 'order' }), /已支付/);
});
test('版本并发冲突不追加第二条历史，待审申请不可覆盖', async () => {
  const s = setup();
  const outcomes = await Promise.allSettled([s.propose(), s.propose()]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(s.state.period.correctionHistory.length, 1);
  await assert.rejects(s.propose({ expectedRevision: 1 }), /不能重复/);
});
test('审核通过不激活更正、不写任务；重复审核不重复留痕', async () => {
  const s = setup(); await s.propose();
  const result = await s.review({ startDate: 'injected', moduleData: { injected: true } });
  assert.equal(result.correction.status, 'approved_pending_apply');
  assert.equal(result.correction.proposed.startDate, '2027-02-01');
  assert.equal(s.state.period.startDate, '2027-01-01');
  assert.equal(s.state.period.correctionHistory.length, 2);
  for (const u of s.state.updates) assert.deepEqual(Object.keys(u.$set), ['correction']);
  await assert.rejects(s.review(), /已处理/);
  assert.equal(s.state.period.correctionHistory.length, 2);
});
test('审核必须显式确认影响，拒绝旧版本和其他申请ID', async () => {
  const s = setup(); await s.propose();
  await assert.rejects(s.review({ impactAcknowledged: false }), /已核对/);
  await assert.rejects(s.review({ applicationPolicy: undefined }), /安全应用规则/);
  await assert.rejects(s.review({ expectedRevision: 0 }), /版本/);
  await assert.rejects(s.review({ correctionId: 'other' }), /版本/);
});
test('执行状态变化阻止旧快照审核，刷新留痕后才允许审核', async () => {
  const s = setup(); s.state.taskRows = [{ _id: 'task', dueDate: '2027-03-01', status: 'pending' }];
  await s.propose(); s.state.taskRows[0].status = 'completed';
  await assert.rejects(s.review(), /状态已变化/);
  await refreshCorrectionImpact({ plan: s.plan, patient: s.patient, staff: s.advisor, input: { expectedRevision: 1, correctionId: s.state.period.correction.id } }, s.models);
  assert.equal(s.state.period.correction.impact.records[0].preserve, true);
  await s.review();
  assert.deepEqual(s.state.period.correctionHistory.map(x => x.action), ['submitted', 'impact_refreshed', 'approve']);
});
test('审核时重新核验订单，申请后退款不能审核通过', async () => {
  const s = setup(); s.state.order = { _id: 'order', user: 'patient', orderType: 'package', paymentStatus: 'paid', serviceId: 'pkg_1y' };
  await s.propose({ sourceType: 'paid_order', sourceOrderId: 'order' });
  s.state.order.refundStatus = 'refunded';
  await assert.rejects(s.review(), /已支付/);
  assert.equal(s.state.period.correction.status, 'pending_review');
});
test('退回可重新提交，保留首次申请和审核记录', async () => {
  const s = setup(); await s.propose(); const originalId = s.state.period.correction.id;
  await assert.rejects(s.review({ decision: 'reject', note: '' }), /退回/);
  await s.review({ decision: 'reject', note: '请核对合同' });
  await s.propose({ expectedRevision: 2 });
  assert.notEqual(s.state.period.correction.id, originalId);
  assert.equal(s.state.period.correctionHistory[0].id, originalId);
  assert.equal(s.state.period.correctionHistory.length, 3);
});
test('规划师可撤回待审申请；撤回不删除历史或改变生效日期', async () => {
  const s = setup(); await s.propose();
  await withdrawCorrection({ plan: s.plan, patient: s.patient, staff: s.planner, input: { expectedRevision: 1, correctionId: s.state.period.correction.id } }, s.models);
  assert.equal(s.state.period.correction.status, 'withdrawn'); assert.equal(s.state.period.startDate, '2027-01-01');
  assert.equal(s.state.period.correctionHistory.length, 2);
});
test('关联服务、进行中、取消和人工停用补给列入保留清单', async () => {
  const s = setup();
  s.state.followups = [{ _id: 'linked', status: 'planned', serviceTracking: { linkId: 'service' } }, { _id: 'running', status: 'in_progress' }, { _id: 'cancelled', status: 'cancelled' }];
  s.state.supplies = [{ _id: 'disabled', workflowStatus: 'idle', enabled: false }];
  const impact = await correctionImpact(s.plan, s.input, s.models);
  assert.equal(impact.records.length, 4); assert.ok(impact.records.every(x => x.preserve));
});
test('工作台待审核归顾问、退回归规划师，其他客户人员不可见', () => {
  const s = setup(); const plans = [{ ...s.plan, patientId: s.patient }];
  for (const [status, actor, other] of [['pending_review', s.advisor, s.planner], ['rejected', s.planner, s.advisor]]) {
    const periods = [{ annualPlanId: 'plan', correction: { status, reviewNote: '请核对' } }];
    assert.equal(buildAnnualRenewalTodos(plans, periods, actor).length, 1);
    assert.equal(buildAnnualRenewalTodos(plans, periods, other).length, 0);
    assert.equal(buildAnnualRenewalTodos(plans, periods, { ...actor, _id: 'other' }).length, 0);
  }
  assert.equal(buildAnnualRenewalTodos(plans, [{ annualPlanId: 'plan', correction: { status: 'approved_pending_apply' } }], s.advisor).length, 0);
});
test('顾问明确审核未派发固定日期，修订内容同时写入审核审计', async () => {
  const s = setup(); s.plan.moduleData = { medical_treatment: { records: [{ visit_time: '2027-01-02' }] } };
  await s.propose();
  const scheduleChanges = [{ moduleKey: 'medical_treatment', index: 0, field: 'visit_time', from: '2027-01-02', to: '2027-03-02' }];
  await assert.rejects(s.review({ scheduleChanges }), /明确确认/);
  await assert.rejects(s.review({ scheduleChanges, applicationPolicy: 'revise_unissued_fixed' }), /审核原因/);
  const result = await s.review({ scheduleChanges, applicationPolicy: 'revise_unissued_fixed', note: '按更正服务期安排' });
  assert.deepEqual(result.correction.scheduleChanges, scheduleChanges);
  assert.deepEqual(s.state.period.correctionHistory[1].scheduleChanges, scheduleChanges);
  assert.equal(s.plan.moduleData.medical_treatment.records[0].visit_time, '2027-01-02');
});
test('顾问不能借日期审核替换其他字段，也不能修订已派发事项', async () => {
  const s = setup(); s.plan.moduleData = { medical_treatment: { records: [{ visit_time: '2027-01-02' }] } };
  s.state.followups = [{ _id: 'existing', sourceScheduleKey: 'medical_treatment:2027-01-02:事项', status: 'planned', date: '2027-01-02' }];
  await s.propose();
  const changes = [{ moduleKey: 'medical_treatment', index: 0, field: 'visit_time', from: '2027-01-02', to: '2027-03-02' }];
  await assert.rejects(s.review({ scheduleChanges: changes, applicationPolicy: 'revise_unissued_fixed', note: '核对' }), /已有派发/);
  await assert.rejects(s.review({ scheduleChanges: [{ ...changes[0], field: 'serviceMode' }], applicationPolicy: 'revise_unissued_fixed', note: '核对' }), /固定日期/);
});
