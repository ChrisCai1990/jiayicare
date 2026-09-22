export function canRecordProgress(task) {
  if (task?.healthManagementEnabled === false) return false
  return !!task && !task.taskRole && (!task.workflowKey || /^(professional_assessment|report_followup):dynamic_followup$/.test(task.workflowKey))
}
export function requiresOutcomeReview(task) {
  if (task?.healthManagementEnabled === false) return false
  if (!task || task.taskRole) return false
  return task.continuityRequired === true
    || (task.sourceType === 'scheduled' && /^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/.test(task.sourceScheduleKey || ''))
    || (['professional_assessment', 'report_followup'].includes(task.sourceType) && ['medical_visit', 'examination', 'review'].includes(task.formData?.category))
}
