const test = require('node:test');
const assert = require('node:assert/strict');
const Assessment = require('../src/models/ProfessionalHealthAssessment');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');
const { referralAssessmentSource, isAssessmentSourceCurrent, completeReferralAndCreateAdvisorReview, ensureAdvisorReviewTask } = require('../src/utils/referralAssessmentWorkflow');
const { runAssessmentDraft } = require('../src/utils/assessmentFollowUpAutomation');

const referral = () => ({ _id: 'referral', patientId: 'patient', status: 'completed', reason: '后续沟通评估', responseAnalysis: '已核对资料', responseOpinion: '沟通下一步安排', respondedAt: new Date('2026-09-19'), consultation: { feedbackType: 'internal_collaboration', nextPlan: '下次联系确认' } });

test('来源指纹不随重发时间改变，但内容、核验状态改变则生成新版本', () => {
  const r = referral();
  const original = referralAssessmentSource(r).sourceFeedbackKey;
  assert.equal(referralAssessmentSource({ ...r, respondedAt: new Date() }).sourceFeedbackKey, original);
  assert.notEqual(referralAssessmentSource({ ...r, responseOpinion: '已完成，后续无需行动' }).sourceFeedbackKey, original);
  assert.notEqual(referralAssessmentSource({ ...r, consultation: { ...r.consultation, verificationStatus: 'source_verified' } }).sourceFeedbackKey, original);
  assert.notEqual(referralAssessmentSource({ ...r, feedbackVersion: 3 }).sourceFeedbackKey, original);
  assert.notEqual(referralAssessmentSource({ ...r, consultation: { ...r.consultation, medicationAdvice: '医疗机构新建议' } }).sourceFeedbackKey, original);
});

test('重交同一反馈不会改写已终审内容或重开审核工作台任务', async t => {
  const r = referral();
  const key = referralAssessmentSource(r).sourceFeedbackKey;
  const approved = { _id: 'assessment', patientId: 'patient', status: 'approved', sourceFeedbackKey: key, followUpDrafts: [{ title: '原审核内容' }] };
  t.mock.method(FollowUp, 'updateMany', async () => ({}));
  t.mock.method(Assessment, 'findOne', () => ({ sort: () => ({ lean: async () => null }) }));
  t.mock.method(Assessment, 'findOneAndUpdate', async (q, u) => {
    assert.equal(q.sourceFeedbackKey, key);
    assert.ok(u.$setOnInsert);
    assert.equal(u.$set, undefined);
    return approved;
  });
  t.mock.method(FollowUp, 'findOneAndUpdate', async () => { throw new Error('不能重开审核任务'); });
  const result = await completeReferralAndCreateAdvisorReview(r, { _id: 'specialist' });
  assert.equal(result.status, 'approved');
  assert.equal(result.followUpDrafts[0].title, '原审核内容');
});

test('修订反馈创建独立快照，旧批准记录和已发布任务不动', async t => {
  const r = referral();
  const prior = { _id: 'old', status: 'approved', sourceCutoffAt: new Date('2026-09-18') };
  const writes = [];
  t.mock.method(FollowUp, 'updateMany', async q => { assert.equal(q.workflowKey, 'professional_assessment:professional_review'); });
  t.mock.method(Assessment, 'findOne', () => ({ sort: () => ({ lean: async () => prior }) }));
  t.mock.method(Assessment, 'findOneAndUpdate', async (q, u) => {
    writes.push({ q, u });
    return { _id: 'new', ...u.$setOnInsert };
  });
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: 'advisor' }) }) }));
  t.mock.method(FollowUp, 'findOneAndUpdate', async (q, u) => {
    assert.equal(q.sourceId, 'new');
    assert.equal(u.$set.assignedTo, 'advisor');
    assert.equal(u.$setOnInsert.status, 'planned');
    assert.equal(u.$set.status, undefined);
  });
  const result = await completeReferralAndCreateAdvisorReview(r, { _id: 'specialist' });
  assert.equal(result.supersedesAssessmentId, 'old');
  assert.equal(result.followUpAutomation.status, 'queued');
  assert.equal(writes.length, 1);
});

test('新修订淘汰旧待审草稿，状态条件保护已批准快照', async t => {
  const r = referral();
  t.mock.method(FollowUp, 'updateMany', async () => ({}));
  t.mock.method(Assessment, 'findOne', () => ({ sort: () => ({ lean: async () => ({ _id: 'old', status: 'advisor_review', sourceCutoffAt: new Date('2026-09-18') }) }) }));
  t.mock.method(Assessment, 'findOneAndUpdate', async (q, u) => {
    if (q._id === 'old') {
      assert.ok(!q.status.$in.includes('approved'));
      assert.equal(u.$set.status, 'superseded');
      assert.equal(u.$inc.__v, 1);
      return { _id: 'old' };
    }
    return { _id: 'new', ...u.$setOnInsert };
  });
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedFamilyDoctor: 'advisor' }) }) }));
  t.mock.method(FollowUp, 'findOneAndUpdate', async () => ({}));
  await completeReferralAndCreateAdvisorReview(r, { _id: 'specialist' });
  assert.equal(FollowUp.updateMany.mock.calls.length, 2);
});

test('缺少顾问不会无声丢任务，转给已分配规划师处理归属', async t => {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ assignedHealthPlanner: 'planner' }) }) }));
  t.mock.method(FollowUp, 'findOneAndUpdate', async (q, u) => {
    assert.equal(u.$set.assignedTo, 'planner');
    assert.match(u.$set.theme, /分配健康顾问/);
  });
  await ensureAdvisorReviewTask({ _id: 'assessment', patientId: 'patient', status: 'advisor_review', createdBy: 'specialist' });
});

test('源反馈变更后旧版本不能继续生成AI草稿', async () => {
  const r = referral();
  const row = { _id: 'assessment', __v: 0, patientId: 'patient', status: 'advisor_review', sourceReferralIds: [r._id], sourceFeedbackKey: referralAssessmentSource(r).sourceFeedbackKey, followUpAutomation: { status: 'queued' } };
  const deps = {
    Referral: { findById: () => ({ lean: async () => ({ ...r, responseOpinion: '新意见' }) }) },
    Assessment: { findById: () => ({ lean: async () => row }), findOneAndUpdate: async (q, u) => { assert.equal(u.$set.status, 'superseded'); return { ...row, ...u.$set }; } },
    completeReview: async () => {},
    chat: async () => { throw new Error('不应调用AI'); },
  };
  assert.equal(await isAssessmentSourceCurrent(row, deps), false);
  await assert.rejects(runAssessmentDraft(row._id, { automatic: true }, deps), /已更新/);
});
