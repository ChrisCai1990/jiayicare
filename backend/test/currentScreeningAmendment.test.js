const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const router = require('../src/routes/staff');
const User = require('../src/models/User');
const AnnualPlan = require('../src/models/AnnualPlan');
const CheckupReview = require('../src/models/AIHealthCheckupReview');
const PushRecord = require('../src/models/PushRecord');
const pilot = require('../src/utils/annualFlowPilot');
const checkup = require('../src/utils/aiHealthCheckupItems');
const Decision = require('../src/models/AnnualManagementDecision');
const evidenceService = require('../src/utils/annualManagementEvidence');

const handler = router.stack.find(layer => layer.route?.path === '/patients/:id/annual-plan/:planId/append-screening-action')?.route.stack.at(-1).handle;
const id = () => new mongoose.Types.ObjectId().toString();
const chain = value => ({ lean: async () => value, select: () => ({ lean: async () => value }) });

test('金娟试点只把已核对缺项补入已发布方案，并留下执行复核和客户通知', async t => {
  assert.equal(typeof handler, 'function');
  const patientId = id(), planId = id(), reviewId = id(), staffId = id(), at = new Date('2026-11-17T00:00:00Z');
  const plan = { _id: planId, patientId, year: 2026, updatedAt: at, pushedAt: at, confirmedAt: at,
    reviewStatus: 'approved', moduleData: { checkup_completion: { enabled: true, records: [] } } };
  let enabled = false, saved = null, notified = null, noticeAttempts = 0;
  t.mock.method(pilot, 'enabled', () => enabled);
  t.mock.method(User, 'findById', () => chain({ tenantId: null, assignedFamilyDoctor: staffId, aiHealthSummary: {} }));
  t.mock.method(AnnualPlan, 'findOne', () => chain(plan));
  t.mock.method(CheckupReview, 'findOne', () => chain({ _id: reviewId, sourceKey: 'key', sourceVersion: 'version', itemText: '甲状腺超声待补', title: '甲状腺超声' }));
  t.mock.method(checkup, 'approvedItems', () => ({ approved: true, version: 'version', items: [{ sourceKey: 'key', text: '甲状腺超声待补' }] }));
  t.mock.method(AnnualPlan, 'findOneAndUpdate', async (filter, update) => { saved = { filter, update }; return { ...plan, moduleData: update.$set.moduleData }; });
  t.mock.method(PushRecord, 'updateOne', async (filter, update) => { noticeAttempts++; notified = { filter, ...update.$setOnInsert }; });
  const call = async (patch = {}) => {
    const req = { params: { id: patientId, planId }, staff: { _id: staffId, role: 'superadmin', tenantId: null }, body: {
      sourceKind: 'ai_checkup', sourceId: reviewId, baseUpdatedAt: at.toISOString(), reason: '已审核资料提示缺项',
      advice: '顾问核对适用性后安排检查', changeReason: '当前筛查核对补入', ...patch } };
    const result = { code: 200 }; const res = { status(code) { result.code = code; return this; }, json(value) { result.value = value; return this; } };
    await handler(req, res); return result;
  };
  assert.equal((await call()).code, 404);
  enabled = true;
  assert.equal((await call({ baseUpdatedAt: 'stale' })).code, 409);
  const success = await call(); assert.equal(success.code, 200, JSON.stringify(success));
  assert.equal(noticeAttempts, 1);
  assert.deepEqual(saved.update.$set.moduleData.checkup_completion.records[0].sourceIds, [`management_issue:${reviewId}`]);
  assert.equal(saved.update.$push.supplementRevisions.executionReview.status, 'pending');
  assert.equal(notified.patientId, patientId);
  plan.moduleData = saved.update.$set.moduleData;
  plan.supplementRevisions = [saved.update.$push.supplementRevisions];
  assert.equal((await call()).code, 200);
  assert.equal(noticeAttempts, 2);
});

test('同次定期复查作为一条完整就诊安排补入，带齐项目、专科与全部来源', async t => {
  const patientId = id(), planId = id(), decisionId = id(), otherId = id(), staffId = id(), at = new Date('2026-11-17T00:00:00Z');
  const sourceId = `management_issue:${decisionId}`, otherSourceId = `management_issue:${otherId}`;
  const plan = { _id: planId, patientId, year: 2026, updatedAt: at, pushedAt: at, confirmedAt: at,
    reviewStatus: 'approved', moduleData: { abnormal_followup: { enabled: true, records: [] } } };
  let saved;
  t.mock.method(pilot, 'enabled', () => true);
  t.mock.method(User, 'findById', () => chain({ tenantId: null, assignedFamilyDoctor: staffId }));
  t.mock.method(AnnualPlan, 'findOne', () => chain(plan));
  t.mock.method(Decision, 'findOne', () => chain({ _id: decisionId, title: '肺结节', direction: 'abnormal_followup' }));
  t.mock.method(evidenceService, 'load', async () => ({ evidence: [
    { id: sourceId, content: { problem: '肺结节', reviewPlan: { kind: 'recheck', anchorDate: '2026-11-01', intervalMonths: 3, department: '呼吸科', items: ['胸部CT'] } } },
    { id: otherSourceId, content: { problem: '另一处影像异常', reviewPlan: { kind: 'recheck', anchorDate: '2026-11-01', intervalMonths: 3, department: '呼吸科', items: ['肺功能'] } } },
  ] }));
  t.mock.method(AnnualPlan, 'findOneAndUpdate', async (filter, update) => { saved = update.$set.moduleData.abnormal_followup.records[0]; return plan; });
  t.mock.method(PushRecord, 'updateOne', async () => {});
  const req = { params: { id: patientId, planId }, staff: { _id: staffId, role: 'superadmin', tenantId: null }, body: {
    sourceKind: 'decision', sourceId: decisionId, baseUpdatedAt: at.toISOString(), reason: '已审核影像需要复查',
    advice: '先安排呼吸科就诊', changeReason: '补入当前筛查事项' } };
  const result = { code: 200 }, res = { status(code) { result.code = code; return this; }, json(value) { result.value = value; return this; } };
  await handler(req, res);
  assert.equal(result.code, 200, JSON.stringify(result));
  assert.deepEqual(saved.sourceIds, [sourceId, otherSourceId]);
  assert.equal(saved.items, '复查2项检查');
  assert.deepEqual(saved.reviewItems, ['胸部CT', '肺功能']);
  assert.equal(saved.department, '呼吸科');
  assert.equal(saved.time, '2027-02-01');
});

test('通知失败后重试只补发通知，不重复补入方案', async t => {
  const patientId = id(), planId = id(), reviewId = id(), staffId = id(), at = new Date('2026-11-17T00:00:00Z');
  const plan = { _id: planId, patientId, year: 2026, updatedAt: at, pushedAt: at, confirmedAt: at,
    reviewStatus: 'approved', moduleData: { checkup_completion: { enabled: true, records: [] } }, supplementRevisions: [] };
  let planWrites = 0, noticeAttempts = 0;
  t.mock.method(pilot, 'enabled', () => true);
  t.mock.method(User, 'findById', () => chain({ tenantId: null, assignedFamilyDoctor: staffId, aiHealthSummary: {} }));
  t.mock.method(AnnualPlan, 'findOne', () => chain(plan));
  t.mock.method(CheckupReview, 'findOne', () => chain({ _id: reviewId, sourceKey: 'key', sourceVersion: 'version', itemText: '骨密度待补', title: '骨密度检查' }));
  t.mock.method(checkup, 'approvedItems', () => ({ approved: true, version: 'version', items: [{ sourceKey: 'key', text: '骨密度待补' }] }));
  t.mock.method(AnnualPlan, 'findOneAndUpdate', async (_filter, update) => {
    planWrites++; plan.moduleData = update.$set.moduleData; plan.supplementRevisions.push(update.$push.supplementRevisions); return plan;
  });
  t.mock.method(PushRecord, 'updateOne', async () => { if (++noticeAttempts === 1) throw new Error('notice unavailable'); });
  const call = async () => {
    const req = { params: { id: patientId, planId }, staff: { _id: staffId, role: 'superadmin', tenantId: null }, body: {
      sourceKind: 'ai_checkup', sourceId: reviewId, baseUpdatedAt: at.toISOString(), reason: '已核对检查缺项',
      advice: '顾问安排骨密度检查', changeReason: '当前筛查核对补入' } };
    const result = { code: 200 }, res = { status(code) { result.code = code; return this; }, json(value) { result.value = value; return this; } };
    await handler(req, res); return result;
  };
  const first = await call(); assert.equal(first.code, 503); assert.match(first.value.message, /已补入/);
  assert.equal(planWrites, 1);
  const retried = await call(); assert.equal(retried.code, 200);
  assert.equal(planWrites, 1); assert.equal(noticeAttempts, 2);
});

test('已发布目标修订在 standalone 保存，通知失败可按请求编号重试', async t => {
  const goalHandler = router.stack.find(layer => layer.route?.path === '/patients/:id/annual-plan/:planId/management-goals')?.route.stack.at(-1).handle;
  const patientId = id(), planId = id(), staffId = id(), issueId = `management_issue:${id()}`;
  const at = new Date('2026-11-17T00:00:00Z'), requestId = '6da527d9-2ba7-4743-97fb-f1c7ec0085d1';
  const plan = { _id: planId, patientId, year: 2026, updatedAt: at, pushedAt: at, confirmedAt: at,
    reviewStatus: 'approved', moduleData: { checkup_completion: { records: [{ items: '骨密度检查', sourceIds: [issueId] }] } }, supplementRevisions: [] };
  let writes = 0, notices = 0;
  t.mock.method(pilot, 'enabled', () => true);
  t.mock.method(User, 'findById', () => chain({ tenantId: null, assignedFamilyDoctor: staffId }));
  t.mock.method(AnnualPlan, 'findOne', () => chain(plan));
  t.mock.method(AnnualPlan, 'findOneAndUpdate', async (_filter, update) => {
    writes++; plan.moduleData = update.$set.moduleData; plan.supplementRevisions.push(update.$push.supplementRevisions); return plan;
  });
  t.mock.method(PushRecord, 'updateOne', async () => { if (++notices === 1) throw new Error('notice unavailable'); });
  const call = async () => {
    const req = { params: { id: patientId, planId }, staff: { _id: staffId, role: 'superadmin', tenantId: null }, body: {
      requestId, baseUpdatedAt: at.toISOString(), reason: '补充阶段目标',
      goals: [{ issueId, goal: '完成骨密度评估', focus: '核对报告和后续安排', baseline: '', goalDimension: '' }] } };
    const result = { code: 200 }, res = { status(code) { result.code = code; return this; }, json(value) { result.value = value; return this; } };
    await goalHandler(req, res); return result;
  };
  assert.equal((await call()).code, 503);
  assert.equal((await call()).code, 200);
  assert.equal(writes, 1); assert.equal(notices, 2);
});
