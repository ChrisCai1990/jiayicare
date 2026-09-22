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
test('only assessment gate waived; other preparation and next year remain required', () => {
  const decision = annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria, assessmentNotRequiredReason: '已核对资料' }, 'd');
  const preparation = { ...decision, medicationStatus: 'none', supplementStatus: 'none', advisorReadyConfirmedAt: new Date() };
  assert.equal(checklist({ patient, preparation, auditedReportCount: 1 }).ready, true);
  assert.ok(checklist({ patient, preparation }).blockingKeys.includes('audited_reports'));
  assert.ok(checklist({ patient, preparation: { ...preparation, advisorReadyConfirmedAt: null }, auditedReportCount: 1 }).blockingKeys.includes('advisor_ready'));
  assert.ok(checklist({ patient, preparation: null }).blockingKeys.includes('assessment_scope'));
  assert.ok(checklist({ patient, preparation: { ...preparation, assessmentDecisionBy: null } }).blockingKeys.includes('assessment_scope'));
});
test('every missing condition, duplicates and unconfirmed legacy records fail closed', () => {
  for (const missing of criteria) assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria.filter(key => key !== missing) }, 'd'));
  assert.throws(() => annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: Array(5).fill(criteria[0]) }, 'd'));
  const saved = annualAssessmentDecision({ assessmentMode: 'none', assessmentConfirmedCriteria: criteria }, 'd');
  assert.equal(saved.assessmentCriteriaVersion, 1);
  assert.ok(saved.assessmentNotRequiredReason.includes('关键档案'));
  for (const preparation of [{ ...saved, assessmentConfirmedCriteria: [] }, { ...saved, assessmentCriteriaVersion: null }]) {
    assert.ok(checklist({ patient, preparation }).blockingKeys.includes('assessment_scope'));
  }
});
test('switching back to required restores domain approval requirements', () => {
  const decision = annualAssessmentDecision({ assessmentMode: 'required', assessmentNotRequiredReason: '旧理由', requiredAssessmentDomains: ['心血管'] }, 'd');
  assert.equal(decision.assessmentNotRequiredReason, '');
  assert.ok(checklist({ patient, preparation: decision }).blockingKeys.includes('assessment:心血管'));
  assert.equal(annualAssessmentDecision({}, 'd').assessmentMode, 'required');
});
