// Catalog linkage must not determine whether an unfinished plan remains visible.
// A skipped item does not establish that the examination was completed.
function summarizeCheckupItems(items = [], auditedReports = null) {
  const rows = Array.isArray(items) ? items : [];
  const audited = auditedReports === null ? null : new Set(auditedReports.map(report => String(report._id)));
  const complete = item => item?.status === 'completed' && (audited === null || (item.reportId && audited.has(String(item.reportId))));
  const completedCount = rows.filter(complete).length;
  const skippedCount = rows.filter(item => item?.status === 'skipped').length;
  const pendingItems = rows.filter(item => !complete(item));
  const missingReportCount = pendingItems.filter(item => item?.status === 'completed' && !item.reportId).length;
  const unapprovedReportCount = pendingItems.filter(item => item?.status === 'completed' && item.reportId).length;
  return {
    totalItems: rows.length, completedCount, skippedCount,
    pendingCount: pendingItems.length,
    missingReportCount, unapprovedReportCount,
    pendingNames: pendingItems.map(item => item?.name || ''),
    progressStatus: rows.length > 0 && completedCount === rows.length ? 'completed'
      : completedCount > 0 || skippedCount > 0 ? 'in_progress' : 'pending',
  };
}

function checkupWorkStage(plan, tasks = [], schemes = []) {
  const stageByScheme = new Map(schemes.map(scheme => [String(scheme._id), scheme.workflowStageKey]));
  const stageOf = task => stageByScheme.get(String(task.followUpSchemeId || ''))
    || (/报告.*(?:回收|获取|归档)|审核.*报告/.test(task.theme || '') ? 'report_collection'
      : /体检预约|预约.*体检/.test(task.theme || '') ? 'booking' : '');
  const active = tasks.filter(task => task.status !== 'cancelled');
  const hasReview = plan.status === 'completed'
    || active.some(task => ['report_collection', 'result_review', 'final_acceptance'].includes(stageOf(task)) && !task.isBlocked)
    || active.some(task => stageOf(task) === 'onsite' && task.status === 'completed')
    || (plan.items || []).some(item => item.reportId || item.status === 'completed');
  if (hasReview) return 'review';
  if (active.some(task => stageOf(task) === 'booking' && task.status === 'completed')) return 'waiting_exam';
  if (active.some(task => stageOf(task) === 'booking' && !task.isBlocked)) return 'booking';
  return 'unknown';
}

function buildCheckupWorkbenchRows(plans, patients, includeCompleted = false, auditedReports = null, tasksByPlan = new Map(), schemes = []) {
  const patientMap = new Map(patients.map(patient => [String(patient._id), patient]));
  return plans.flatMap(plan => {
    if ((plan.type && plan.type !== 'annual_checkup') || !['active', 'completed'].includes(plan.status) || !plan.pushedAt) return [];
    const patient = patientMap.get(String(plan.patientId));
    const ownReports = auditedReports === null ? null : auditedReports.filter(report => String(report.user) === String(plan.patientId));
    const progress = summarizeCheckupItems(plan.items, ownReports);
    if (!patient || !progress.totalItems || (!includeCompleted && !progress.pendingCount)) return [];
    return [{
      patientId: plan.patientId, patientName: patient.name, patientPhone: patient.phone,
      planId: plan._id, planTitle: plan.title, ...progress,
      workStage: checkupWorkStage(plan, tasksByPlan.get(String(plan._id)) || [], schemes), createdAt: plan.createdAt,
    }];
  }).sort((a, b) => b.pendingCount - a.pendingCount
    || String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
    || String(a.planId).localeCompare(String(b.planId)));
}

module.exports = { summarizeCheckupItems, checkupWorkStage, buildCheckupWorkbenchRows };
