const test = require('node:test');
const assert = require('node:assert/strict');
const Draft = require('../src/models/ReportFollowUpDraft');
const Report = require('../src/models/MedicalReport');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const { materializeReportEvent, generateReportDraft, syncReportReviewTask } = require('../src/utils/reportFollowUpAutomation');
const { sourceDigest } = require('../src/utils/reportFollowUpSource');
const { publishReportFollowUps } = require('../src/utils/dynamicAssessmentFollowUps');
const { isServiceRequest } = require('../src/utils/followUpServiceState');

test('报告事件按唯一来源键落库后才标记完成，专用服务不调用AI或新增审核任务', async t => {
  const report = { _id: 'report', user: 'patient', audit_status: 'audited', sourceOrderId: 'order', followUpSourceEvent: { status: 'queued', sequence: 1, digest: 'digest' } };
  t.mock.method(Draft, 'findOne', () => ({ lean: async () => null }));
  t.mock.method(Draft, 'findOneAndUpdate', async (q, u) => { assert.equal(q.sourceKey, 'report:1:digest'); assert.equal(u.$set, undefined); assert.equal(u.$setOnInsert.status, 'excluded'); return { _id: 'draft', ...u.$setOnInsert }; });
  t.mock.method(Draft, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  t.mock.method(Draft, 'updateMany', async () => ({}));
  t.mock.method(FollowUp, 'updateMany', async () => ({}));
  t.mock.method(FollowUp, 'findOneAndUpdate', async () => { throw Error('不应派任务'); });
  t.mock.method(Report, 'updateOne', async (q, u) => { assert.equal(q['followUpSourceEvent.sequence'], 1); assert.equal(q['followUpSourceEvent.digest'], 'digest'); assert.equal(u.$set['followUpSourceEvent.status'], 'processed'); });
  const draft = await materializeReportEvent(report);
  assert.equal(draft.followUpAutomation.status, 'skipped');
});

test('报告草稿发布保持独立来源，同时复用经理随访和规划师服务配对', async () => {
  const rows = new Map();
  const result = await publishReportFollowUps({ _id: 'draft', patientId: 'patient', status: 'approved', followUpDrafts: [{ title: '预约', content: '落实已确定安排', date: '2099-01-01', category: 'medical_visit', requiresService: true }] }, { _id: 'advisor' }, {
    User: { findById: () => ({ select: () => ({ lean: async () => ({ _id: 'patient', assignedHealthManager: 'manager', assignedHealthPlanner: 'planner' }) }) }) },
    FollowUp: { updateOne: async (q, u) => { rows.set(q.assessmentActionKey, u.$setOnInsert); return { upsertedCount: 1 }; } },
  });
  assert.equal(result.created, 2);
  const [follow, service] = [...rows.values()];
  assert.equal(follow.sourceType, 'report_followup'); assert.equal(follow.formData.reportDraftId, 'draft');
  assert.equal(follow.formData.assessmentId, undefined); assert.equal(follow.assignedTo, 'manager');
  assert.equal(service.assignedTo, 'planner'); assert.equal(service.formData.linkedFollowUpActionKey, follow.assessmentActionKey);
  assert.ok(isServiceRequest(service));
});

test('无明确后续行动的报告自动结束整理，不增加顾问审核任务', async t => {
  const report = { _id: 'report', user: 'patient', audit_status: 'audited', reportItems: [], followUpSourceEvent: { sequence: 1 } };
  const row = { _id: 'draft', patientId: 'patient', reportId: 'report', status: 'advisor_review', purpose: 'issue_collaboration', __v: 0, sourceSequence: 1, sourceKey: `report:1:${sourceDigest(report)}`, sourceSnapshot: {}, followUpDrafts: [], followUpAutomation: { status: 'queued', attempts: 0 } };
  const apply = update => {
    for (const [key, value] of Object.entries(update.$set || {})) { const [a, b] = key.split('.'); if (b) row[a][b] = value; else row[a] = value; }
    row.__v++; return { ...row };
  };
  t.mock.method(Draft, 'findById', () => Object.assign(Promise.resolve({ ...row }), { lean: async () => structuredClone(row) }));
  t.mock.method(Draft, 'findOneAndUpdate', async (q, u) => apply(u));
  t.mock.method(Draft, 'updateOne', async (q, u) => apply(u));
  t.mock.method(Report, 'findById', () => ({ lean: async () => report }));
  for (const name of ['AbnormalReview', 'FollowUp', 'HealthPlan', 'Referral']) t.mock.method(require(`../src/models/${name}`), 'exists', async () => false);
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: 'patient', assignedFamilyDoctor: 'advisor' }) }) }));
  t.mock.method(require('../src/utils/ai'), 'chat', async () => '{"followUps":[]}');
  t.mock.method(FollowUp, 'updateMany', async () => ({}));
  t.mock.method(FollowUp, 'findOneAndUpdate', async () => { throw Error('没有行动不应派任务'); });
  await generateReportDraft(row._id, { automatic: true });
  assert.equal(row.status, 'no_action'); assert.equal(row.followUpDrafts.length, 0);
});

test('已批准但发布中断的草稿保持工作台重试入口，不误当已完成', async t => {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: 'advisor' }) }) }));
  t.mock.method(FollowUp, 'updateMany', async () => { throw Error('发布未完成不能关闭审核任务'); });
  t.mock.method(FollowUp, 'findOneAndUpdate', async (q, u) => {
    assert.equal(u.$set.status, 'planned'); assert.match(u.$set.theme, /重试/);
    assert.equal(u.$setOnInsert.status, undefined); // MongoDB同字段不能同时$set和$setOnInsert。
  });
  await syncReportReviewTask({ _id: 'draft', patientId: 'patient', status: 'approved', followUpPublication: { status: 'failed' } });
});
