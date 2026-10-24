const test = require('node:test');
const assert = require('node:assert/strict');
const { annualAssessmentDecision } = require('../src/utils/annualAssessmentDecision');
const { buildAnnualPlanPreparationChecklist: checklist } = require('../src/utils/annualPlanPreparationChecklist');
const patient = { onboardingCompleted: true, assignedFamilyDoctor: 'd', assignedHealthManager: 'm', assignedHealthPlanner: 'p' };
const criteria = require('../../shared/annualAssessmentCriteria.json').map(item => item.key);
test('no assessment needs five conditions and server reviewer; never accepts client reviewer/date', () => {
  assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentNotRequiredReason: ' ' }, 'd'), /五项条件/);
  assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentNotRequiredReason: '理由' }, null));
  const result = annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria, assessmentNotRequiredReason: ' 理由 ', requiredAssessmentDomains: ['心血管'], assessmentDecisionBy: 'forged' }, 'd');
  assert.equal(result.assessmentDecisionBy, 'd');
  assert.deepEqual(result.requiredAssessmentDomains, []);
  assert.equal(result.assessmentNotRequiredReason, '理由');
});
test('专业评估选择不再阻断方案，基础资料和责任岗位仍校验', () => {
  const decision = annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria, assessmentNotRequiredReason: '已核对资料' }, 'd');
  const preparation = { ...decision, medicationStatus: 'none', supplementStatus: 'none', advisorReadyConfirmedAt: new Date() };
  assert.equal(checklist({ patient, preparation, auditedReportCount: 1 }).ready, true);
  assert.ok(checklist({ patient, preparation }).blockingKeys.includes('audited_reports'));
  assert.equal(checklist({ patient, preparation: { ...preparation, advisorReadyConfirmedAt: null }, auditedReportCount: 1 }).ready, true);
  assert.equal(checklist({ patient, preparation: null, auditedReportCount: 1 }).ready, true);
  assert.ok(checklist({ patient: { onboardingCompleted: true }, preparation, auditedReportCount: 1 }).blockingKeys.includes('family_doctor'));
});
test('every missing condition, duplicates and unconfirmed legacy records fail closed', () => {
  for (const missing of criteria) assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria.filter(key => key !== missing) }, 'd'));
  assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: Array(5).fill(criteria[0]) }, 'd'));
  const saved = annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria }, 'd');
  assert.equal(saved.assessmentCriteriaVersion, 1);
  assert.equal(saved.assessmentNotRequiredReason, ''); // confirmations are separate; no duplicate prose
  for (const preparation of [{ ...saved, assessmentConfirmedCriteria: [] }, { ...saved, assessmentCriteriaVersion: null }]) {
    assert.equal(checklist({ patient, preparation, auditedReportCount: 1 }).ready, true);
  }
});
test('选择专业评估只影响协作记录，不成为年度方案门槛', () => {
  const decision = annualAssessmentDecision({ assessmentMode: 'required', assessmentNotRequiredReason: '旧理由', requiredAssessmentDomains: ['心血管'] }, 'd');
  assert.equal(decision.assessmentNotRequiredReason, '');
  assert.equal(checklist({ patient, preparation: decision, auditedReportCount: 1 }).ready, true);
  assert.equal(annualAssessmentDecision({}, 'd').assessmentMode, 'required');
});
