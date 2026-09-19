const test = require('node:test');
const assert = require('node:assert/strict');
const { loadAnnualPlanContinuity, matchesContinuitySource, continuityPrompt } = require('../src/utils/annualPlanContinuity');
const { buildAnnualPlanPreparationChecklist } = require('../src/utils/annualPlanPreparationChecklist');
const { periodFor } = require('../src/utils/phaseAssessmentScheduler');
function models({ previous = { _id: 'previous', year: 2026 }, review = { _id: 'review', content: '年度目标达成情况', serviceRecordId: 'record', finalizedAt: new Date() }, record = { _id: 'record' } } = {}) {
  return {
    AnnualPlan: { findOne: filter => {
      assert.equal(filter.patientId, 'patient'); assert.deepEqual(filter.year, { $lt: 2027 }); assert.deepEqual(filter.confirmedAt, { $ne: null });
      return { sort: () => ({ lean: async () => previous }) };
    } },
    PhaseAssessment: { findOne: filter => {
      assert.equal(filter.annualPlanId, 'previous'); assert.equal(filter.patientId, 'patient');
      assert.equal(filter.status, 'finalized'); assert.equal(filter.assessmentDomain, 'comprehensive');
      assert.equal(filter['templateSnapshot.frequency'], 'yearly'); assert.equal(filter['doctorReview.status'], 'approved');
      return { sort: () => ({ lean: async () => review }) };
    } },
    ServiceRecord: { findOne: filter => {
      assert.equal(filter.patientId, 'patient'); assert.equal(filter.sourcePhaseAssessmentId, 'review'); assert.equal(filter.aiStatus, 'approved');
      return { select: () => ({ lean: async () => record }) };
    } },
  };
}
test('无既往已确认年度方案时保持首次路径', async () => {
  const value = await loadAnnualPlanContinuity('patient', 2027, models({ previous: null }));
  assert.equal(value.mode, 'initial'); assert.equal(value.source, null);
});
test('续年只采用上一方案的顾问终审综合年度总评及真实归档', async () => {
  const value = await loadAnnualPlanContinuity('patient', 2027, models());
  assert.equal(value.mode, 'renewal'); assert.equal(value.ready, true);
  assert.equal(value.source.previousPlanId, 'previous'); assert.equal(value.source.annualReviewId, 'review');
  assert.match(continuityPrompt(value), /年度目标达成情况/); assert.match(continuityPrompt(value), /不得照搬为新任务/);
});
test('缺少总评或归档时不得使用来源', async () => {
  for (const patch of [{ review: null }, { record: null }]) {
    const value = await loadAnnualPlanContinuity('patient', 2027, models(patch));
    assert.equal(value.ready, false); assert.equal(value.source, null); assert.equal(value.summary, '');
  }
});
const readyBase = {
  patient: { onboardingCompleted: true, assignedFamilyDoctor: 'advisor', assignedHealthManager: 'manager', assignedHealthPlanner: 'planner' },
  preparation: { medicationStatus: 'none', supplementStatus: 'none', advisorReadyConfirmedAt: new Date(), requiredAssessmentDomains: [] },
  auditedReportCount: 1,
};
test('续年不重复首次专科门槛，总评不可豁免', () => {
  assert.equal(buildAnnualPlanPreparationChecklist({ ...readyBase, continuity: { mode: 'renewal', ready: true } }).ready, true);
  const result = buildAnnualPlanPreparationChecklist({ ...readyBase, preparation: { ...readyBase.preparation, waivers: [{ key: 'annual_review', reason: '不可跳过' }] }, continuity: { mode: 'renewal', ready: false } });
  assert.deepEqual(result.blockingKeys, ['annual_review']);
  assert.ok(buildAnnualPlanPreparationChecklist(readyBase).blockingKeys.includes('assessment_scope'));
});
test('顾问指定补充领域仍需审核，续年允许已审核专项协作输入', () => {
  const base = { ...readyBase, preparation: { ...readyBase.preparation, requiredAssessmentDomains: ['运动'] }, continuity: { mode: 'renewal', ready: true } };
  assert.deepEqual(buildAnnualPlanPreparationChecklist(base).blockingKeys, ['assessment:运动']);
  assert.equal(buildAnnualPlanPreparationChecklist({ ...base, assessments: [{ domain: '运动', purpose: 'issue_collaboration', status: 'approved' }] }).ready, true);
});
test('草稿保存和推送的来源不能错配、为空或沿用旧总评', () => {
  const source = { previousPlanId: 'previous', annualReviewId: 'review' };
  assert.equal(matchesContinuitySource(source, source), true);
  for (const actual of [null, {}, { ...source, annualReviewId: 'old' }, { ...source, previousPlanId: 'other' }]) assert.equal(matchesContinuitySource(actual, source), false);
  assert.equal(matchesContinuitySource({}, {}), false);
});
test('进入第11个月启动总评，同一年度方案不按后续年份复制', () => {
  const start = new Date(2025, 10, 15);
  assert.equal(periodFor('yearly', new Date(2026, 8, 14), start), null);
  assert.equal(periodFor('yearly', new Date(2026, 8, 15), start).key, 'Y1');
  assert.equal(periodFor('yearly', new Date(2027, 8, 15), start).key, 'Y1');
  assert.equal(periodFor('yearly', new Date(), 'invalid'), null);
});
