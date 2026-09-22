function annualAssessmentDecision(body, reviewerId, now = new Date()) {
  const mode = body.assessmentMode || 'required';
  const reason = typeof body.assessmentNotRequiredReason === 'string' ? body.assessmentNotRequiredReason.trim() : '';
  if (!['required', 'none'].includes(mode) || (mode === 'none' && (!reason || !reviewerId))) {
    throw Object.assign(new Error('本次无需专科评估时，请由健康顾问填写确认依据'), { statusCode: 400 });
  }
  return {
    assessmentMode: mode, assessmentNotRequiredReason: mode === 'none' ? reason : '',
    assessmentDecisionBy: reviewerId, assessmentDecisionAt: now,
    requiredAssessmentDomains: mode === 'none' ? [] : [...new Set((Array.isArray(body.requiredAssessmentDomains) ? body.requiredAssessmentDomains : []).map(x => String(x).trim()).filter(Boolean))],
  };
}
module.exports = { annualAssessmentDecision };
