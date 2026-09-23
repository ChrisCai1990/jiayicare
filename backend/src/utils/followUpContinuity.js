// Structured source classification only; never infer medical purpose from free text.
function requiresOutcomeReview(task) {
  if (!require('./healthManagementRollout').enabledForTask(task)) return false;
  if (!task || task.taskRole) return false;
  if (!task.sourceType && task.formData?.adHocMedicalReminder === true && task.followUpSchemeId) return true;
  if (task.continuityRequired === true) return true;
  if (task.sourceType === 'scheduled' && /^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/.test(task.sourceScheduleKey || '')) return true;
  return ['professional_assessment', 'report_followup'].includes(task.sourceType)
    && ['medical_visit', 'examination', 'review'].includes(task.formData?.category);
}
function canRecordProgress(task) {
  if (!require('./healthManagementRollout').enabledForTask(task)) return false;
  return !!task && !task.taskRole && (!task.workflowKey || /^(professional_assessment|report_followup):dynamic_followup$/.test(task.workflowKey));
}
module.exports = { requiresOutcomeReview, canRecordProgress };
