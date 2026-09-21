// Suggestions only. Explicit service IDs, never patient/date/title similarity.
const { requiresOutcomeReview } = require('./followUpContinuity');
const same = (a, b) => String(a || '') === String(b || '');
async function outcomeCandidates({ FollowUp, User, Link, Handoff, Report, Draft, id, actor }) {
  const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
  const task = await FollowUp.findById(id).lean();
  if (!task) throw fail('随访不存在', 404);
  const patient = await User.findById(task.patientId).lean();
  if (!patient || (actor.role !== 'superadmin' && (actor.role !== 'familyDoctor' || !same(patient.assignedFamilyDoctor, actor._id)))) throw fail('仅所属健康顾问可核对结果', 403);
  if (!requiresOutcomeReview(task)) throw fail('此任务不适用结果处置', 409);
  const sources = [];
  const links = await Link.find({ patientId: task.patientId, followUpId: task._id, status: { $in: ['waiting', 'completed'] } }).lean();
  for (const link of links) {
    if (link.targetType === 'order') sources.push({ sourceOrderId: link.targetId });
    if (link.targetType === 'health_plan') sources.push({ sourceHealthPlanId: link.targetId }, { planId: link.targetId });
  }
  if (task.sourceType === 'scheduled' && task.sourceAnnualPlanId && /^annual_checkup:\d{4}-\d{2}-\d{2}$/.test(task.sourceScheduleKey || '')) {
    const planners = await FollowUp.find({ patientId: task.patientId, sourceAnnualPlanId: task.sourceAnnualPlanId,
      sourceType: 'annual_service', sourceScheduleKey: `${task.sourceScheduleKey}:prepare:healthPlanner` }).lean();
    // Ambiguous historical duplicates require human reconciliation.
    if (planners.length === 1) {
      const handoffs = await Handoff.find({ patientId: task.patientId, annualPlanId: task.sourceAnnualPlanId,
        plannerTaskId: planners[0]._id, status: 'active' }).lean();
      if (handoffs.length === 1) sources.push({ sourceHealthPlanId: handoffs[0].servicePlanId }, { planId: handoffs[0].servicePlanId });
    }
  }
  if (!sources.length) return { reportIds: [], draftIds: [], basis: 'no_explicit_source' };
  const reports = await Report.find({ user: task.patientId, audit_status: 'audited', $or: sources }).lean();
  const reportIds = [...new Set(reports.map(r => String(r._id)))];
  const drafts = reportIds.length ? await Draft.find({ patientId: task.patientId, reportId: { $in: reportIds },
    status: 'approved', 'followUpPublication.status': 'published' }).lean() : [];
  const { isReportSourceCurrent } = require('./reportFollowUpSource');
  return { reportIds, draftIds: drafts.filter(d => d.followUpDrafts?.length && d.advisorReviewedBy && d.advisorReviewedAt
    && isReportSourceCurrent(d, reports.find(r => same(r._id, d.reportId)))).map(d => String(d._id)), basis: 'explicit_service' };
}
module.exports = { outcomeCandidates };
