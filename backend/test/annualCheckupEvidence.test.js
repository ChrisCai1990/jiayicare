const test = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const flow = require('../src/utils/annualCheckupEvidence');
const now = new Date('2027-03-01T12:00:00+08:00');
const updatedAt = new Date('2027-03-01T10:00:00Z');
const annual = { _id: 'annual', patientId: 'patient', confirmedAt: '2027-01-01', pushedAt: '2026-12-30', reviewStatus: 'approved' };
const draft = { _id: 'checkup', patientId: 'patient', title: '本次体检方案', type: 'annual_checkup', status: 'draft', createdAt: '2027-02-20', content: { aiStatus: 'pending' } };
const approved = { ...draft, status: 'active', pushedAt: '2027-02-28', content: { aiStatus: 'approved', reviewedBy: 'advisor', reviewedAt: '2027-02-27' } };
const task = (role = 'familyDoctor') => ({ _id: 'task', patientId: 'patient', sourceAnnualPlanId: 'annual', assignedTo: role,
  sourceType: 'annual_service', workflowKey: `annual_checkup_preparation:${role}`, sourceScheduleKey: `annual_checkup:2027-03-15:prepare:${role}`,
  status: 'planned', updatedAt, formData: { annualCheckupPreparation: { version: 1, role, targetDate: '2027-03-15' } } });
const actor = role => ({ _id: role, role });
const resources = { date: '2027-03-15', institution: '体检中心', note: '客户与机构已沟通该日时间可行', customerConfirmed: true, resourceConfirmed: true, updatedAt };
const models = (plan, matchedCount = 1) => ({ isValidId: value => value === 'checkup',
  HealthPlan: { findById: () => ({ lean: async () => plan }) },
  FollowUp: { updateOne: async () => ({ matchedCount }) } });

test('准备任务身份须同时满足来源、专用流程和稳定键，不凭标题或任意formData', () => {
  assert.equal(flow.preparationRole(task()), 'familyDoctor');
  for (const patch of [{ sourceType: 'scheduled' }, { workflowKey: 'service_request' }, { sourceScheduleKey: '' }, { sourceAnnualPlanId: null }, { formData: {} }]) {
    assert.equal(flow.preparationRole({ ...task(), ...patch }), '');
  }
});

test('任务创建人、同角色其他人、健管专员均不能代办；指定岗位和超管可以', () => {
  for (const staff of [{ _id: 'creator', role: 'familyDoctor' }, actor('healthManager'), actor('healthPlanner')]) {
    assert.throws(() => flow.assertPreparationOwner({ ...task(), staffId: staff._id }, staff), { statusCode: 403 });
  }
  assert.equal(flow.assertPreparationOwner(task(), actor('familyDoctor')), 'familyDoctor');
  assert.equal(flow.assertPreparationOwner(task(), actor('superadmin')), 'familyDoctor');
});

test('关联草稿只记录来源，不能冒充顾问已完成', async () => {
  const db = models(draft); let write;
  db.FollowUp.updateOne = async (filter, update) => { write = update; assert.ok(filter.updatedAt); return { matchedCount: 1 }; };
  assert.equal((await flow.savePreparationEvidence(task(), annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), db, now)).ready, false);
  assert.equal(write.$set.status, 'in_progress'); assert.equal(write.$set.completedAt, null);
  assert.equal(write.$set['formData.annualCheckupPreparation.evidence'].healthPlanId, 'checkup');
  assert.equal(write.$push['formData.annualCheckupPreparation.history'].by, 'familyDoctor');
});

test('已审核发布的有效方案可直接完成准备，并记录审核证据', async () => {
  const db = models(approved); let write;
  db.FollowUp.updateOne = async (filter, update) => { write = update; return { matchedCount: 1 }; };
  assert.equal((await flow.savePreparationEvidence(task(), annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), db, now)).ready, true);
  assert.equal(write.$set.status, 'completed');
  assert.equal(write.$set['formData.annualCheckupPreparation.evidence'].review.by, 'advisor');
});

for (const [label, patch] of [
  ['其他客户', { patientId: 'other' }], ['旧年度', { createdAt: '2026-01-01' }],
  ['非体检', { type: 'medical_assist' }], ['取消', { status: 'cancelled' }], ['缺失来源日期', { createdAt: null }],
]) test(`拒绝关联${label}方案`, async () => {
  await assert.rejects(flow.savePreparationEvidence(task(), annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), models({ ...draft, ...patch }), now), { statusCode: 400 });
});

test('仅发布、仅审核或缺少审核人时间都不能假完成', () => {
  for (const plan of [draft, { ...approved, pushedAt: null }, { ...approved, content: { aiStatus: 'approved' } }, { ...approved, content: { ...approved.content, aiStatus: 'pending' } }]) {
    assert.equal(flow.checkupPlanReady(plan, task(), annual), false);
  }
  assert.equal(flow.checkupPlanReady({ ...approved, content: { aiStatus: 'approved', aiApprovedBy: 'advisor', aiApprovedAt: '2027-02-27' } }, task(), annual), true);
});

test('规划师保存实际沟通证据完成，不创建订单/服务或更改体检日', async () => {
  const db = models(null); let write;
  db.FollowUp.updateOne = async (filter, update) => { write = update; return { matchedCount: 1 }; };
  const result = await flow.savePreparationEvidence(task('healthPlanner'), annual, resources, actor('healthPlanner'), db, now);
  assert.equal(result.ready, true); assert.equal(write.$set.status, 'completed');
  assert.equal(write.$set['formData.annualCheckupPreparation.evidence'].recordedBy, 'healthPlanner');
  assert.equal(write.$set.date, undefined); assert.equal(write.$set.sourceOrderId, undefined);
});

test('缺少实际沟通信息、日期不一致或过期，规划师不能点空完成', () => {
  for (const patch of [{ note: '' }, { institution: ' ' }, { customerConfirmed: false }, { resourceConfirmed: 'true' }, { date: '2027-03-16' }, { note: 'a'.repeat(2001) }]) {
    assert.throws(() => flow.plannerEvidence({ ...resources, ...patch }, task('healthPlanner'), now), { statusCode: 400 });
  }
  assert.throws(() => flow.plannerEvidence(resources, task('healthPlanner'), '2027-03-16'), { statusCode: 400 });
});

test('过期版本、同时写入竞争、已结束/改派/锁定不能覆盖', async () => {
  await assert.rejects(flow.savePreparationEvidence(task(), annual, { healthPlanId: 'checkup', updatedAt: '2027-01-01' }, actor('familyDoctor'), models(draft), now), { statusCode: 409 });
  await assert.rejects(flow.savePreparationEvidence(task(), annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), models(draft, 0), now), { statusCode: 409 });
  for (const patch of [{ status: 'completed' }, { status: 'cancelled' }, { isBlocked: true }, { serviceTracking: { linkId: 'link' } }]) {
    await assert.rejects(flow.savePreparationEvidence({ ...task(), ...patch }, annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), models(draft), now), { statusCode: 409 });
  }
});

test('自动回写按所选方案收窄，不批量完成其他顾问任务，且重复执行幂等', async () => {
  const bound = { ...task(), formData: { annualCheckupPreparation: { ...task().formData.annualCheckupPreparation, evidence: { healthPlanId: 'checkup' } } } };
  const other = { ...structuredClone(bound), _id: 'other' }; other.formData.annualCheckupPreparation.evidence.healthPlanId = 'another';
  const rows = [bound, other];
  const db = {
    FollowUp: { find: query => ({ lean: async () => rows.filter(sift(query)).map(row => structuredClone(row)) }),
      updateOne: async (query, update) => { const row = rows.find(sift(query)); if (!row) return { modifiedCount: 0 }; Object.assign(row, { status: update.$set.status }); return { modifiedCount: 1 }; } },
    HealthPlan: { findById: id => { assert.equal(id, 'checkup'); return { lean: async () => approved }; } },
    AnnualPlan: { findById: () => ({ lean: async () => annual }) },
  };
  const filter = { 'formData.annualCheckupPreparation.evidence.healthPlanId': 'checkup' };
  assert.equal(await flow.reconcileCheckupPreparation(filter, db), 1);
  assert.equal(await flow.reconcileCheckupPreparation(filter, db), 0);
  assert.equal(other.status, 'planned');
});

test('自动回写失败不吞异常；待审、缺档或跨客户资料不完成', async () => {
  const row = task(); row.formData.annualCheckupPreparation.evidence = { healthPlanId: 'checkup' };
  let plan = draft;
  const db = { FollowUp: { find: () => ({ lean: async () => [row] }), updateOne: async () => { throw Error('write failed'); } },
    HealthPlan: { findById: () => ({ lean: async () => plan }) }, AnnualPlan: { findById: () => ({ lean: async () => annual }) } };
  for (const value of [draft, null, { ...approved, patientId: 'other' }]) { plan = value; assert.equal(await flow.reconcileCheckupPreparation({}, db), 0); }
  plan = approved; await assert.rejects(flow.reconcileCheckupPreparation({}, db), /write failed/);
});

test('同一毫秒内其他提交已改变证据，旧提交亦被原证据快照拦截', async () => {
  const original = task();
  const changed = structuredClone(original);
  changed.formData.annualCheckupPreparation.evidence = { healthPlanId: 'other-plan' };
  const db = models(draft);
  db.FollowUp.updateOne = async query => ({ matchedCount: sift(query)(changed) ? 1 : 0 });
  await assert.rejects(flow.savePreparationEvidence(original, annual, { healthPlanId: 'checkup', updatedAt }, actor('familyDoctor'), db, now), { statusCode: 409 });
});

test('一条异常不阻断其他客户回写，批次仍报告失败等待重试', async () => {
  const first = task(); first.formData.annualCheckupPreparation.evidence = { healthPlanId: 'broken' };
  const second = structuredClone(first); second._id = 'second'; second.formData.annualCheckupPreparation.evidence.healthPlanId = 'checkup';
  let completed = 0;
  const db = { FollowUp: { find: () => ({ lean: async () => [first, second] }), updateOne: async () => { completed++; return { modifiedCount: 1 }; } },
    HealthPlan: { findById: id => ({ lean: async () => { if (id === 'broken') throw Error('read failed'); return approved; } }) },
    AnnualPlan: { findById: () => ({ lean: async () => annual }) } };
  await assert.rejects(flow.reconcileCheckupPreparation({}, db), /read failed/);
  assert.equal(completed, 1);
});
