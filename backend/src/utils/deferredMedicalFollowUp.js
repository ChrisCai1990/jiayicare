const OPEN = ['planned', 'in_progress', 'missed'];
const MEDICAL_SCHEDULE = /^(annual_checkup|checkup_completion|abnormal_followup|medical_treatment|functional_medicine):/;

function eligible(task) {
  if (!task || task.taskRole || task.isBlocked) return false;
  if (task.sourceType === 'scheduled') return MEDICAL_SCHEDULE.test(task.sourceScheduleKey || '');
  return task.sourceType === 'report_followup' && ['medical_visit', 'examination', 'review'].includes(task.formData?.category);
}

function nextDate(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T09:00:00+08:00`);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(now);
  return Number.isFinite(date.getTime()) && value > today && date.getTime() - now.getTime() <= 366 * 86400000 ? date : null;
}

function categoryOf(task) {
  if (task.formData?.category) return task.formData.category;
  return /^medical_treatment:/.test(task.sourceScheduleKey || '') ? 'medical_visit' : 'examination';
}

function successor(task, date, reason) {
  const key = `medical-deferred:${task._id}`;
  return {
    patientId: task.patientId, staffId: task.staffId, assignedTo: task.assignedTo || task.staffId,
    tenantId: task.tenantId || null, date, remindAt: date, nextFollowUpDate: date,
    sourceType: 'report_followup', sourceId: task._id, sourceAnnualPlanId: task.sourceAnnualPlanId || null,
    sourceHealthPlanId: task.sourceHealthPlanId || null,
    assessmentActionKey: key, managementIssueIds: task.managementIssueIds || [],
    theme: `继续跟进 · ${String(task.theme || '检查或就医').replace(/^继续跟进 · /, '').slice(0, 90)}`,
    plannedContent: task.plannedContent || task.content || task.theme || '',
    content: task.plannedContent || task.content || task.theme || '',
    formData: { category: categoryOf(task), deferredFromTaskId: task._id, priorOutcome: reason,
      ...(task.formData?.annualFlowVersion === 2 ? { annualFlowVersion: 2 } : {}) },
    type: task.type || 'phone', status: 'planned', aiStatus: 'approved', reviewRole: null,
    continuityRequired: true, clientVisible: task.clientVisible !== false,
  };
}

module.exports = { OPEN, eligible, nextDate, successor };
