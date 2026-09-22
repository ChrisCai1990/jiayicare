const CRITERIA = require('../../../shared/annualAssessmentCriteria.json');
function supplementalAssessmentNote(value) {
  const labels = new Set(CRITERIA.map(item => item.label));
  return String(value || '').split(/[；;\r\n]+/).map(line => line.trim()).filter(line => line && !labels.has(line)).join('\n');
}
function allAssessmentCriteriaConfirmed(value) {
  return Array.isArray(value) && CRITERIA.every(item => value.includes(item.key));
}
function annualAssessmentDecision(body, reviewerId, now = new Date()) {
  const mode = body.assessmentMode || 'required';
  const reason = supplementalAssessmentNote(body.assessmentNotRequiredReason);
  if (!['required', 'none'].includes(mode) || (mode === 'none' && (!reviewerId || !allAssessmentCriteriaConfirmed(body.assessmentConfirmedCriteria)))) {
    throw Object.assign(new Error('无需新增专科评估时，须由健康顾问确认全部五项条件；不符合或不确定时不能放行'), { statusCode: 400 });
  }
  return {
    assessmentMode: mode, assessmentNotRequiredReason: mode === 'none' ? reason : '',
    assessmentConfirmedCriteria: mode === 'none' ? CRITERIA.map(item => item.key) : [],
    assessmentCriteriaVersion: mode === 'none' ? 1 : null,
    assessmentDecisionBy: reviewerId, assessmentDecisionAt: now,
    requiredAssessmentDomains: mode === 'none' ? [] : [...new Set((Array.isArray(body.requiredAssessmentDomains) ? body.requiredAssessmentDomains : []).map(x => String(x).trim()).filter(Boolean))],
  };
}
module.exports = { annualAssessmentDecision, allAssessmentCriteriaConfirmed, supplementalAssessmentNote };
