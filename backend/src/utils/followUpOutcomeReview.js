const { requiresOutcomeReview } = require('./followUpContinuity');
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const same = (a, b) => String(a || '') === String(b || '');
async function reviewOutcome({ FollowUp, Report, User, Draft, id, actor, body, now = new Date() }) {
  const task = await FollowUp.findById(id).lean();
  if (!task) throw fail('随访不存在', 404);
  const patient = await User.findById(task.patientId).lean();
  if (!patient || (actor.role !== 'superadmin' && (actor.role !== 'familyDoctor' || !same(patient.assignedFamilyDoctor, actor._id)))) throw fail('仅所属健康顾问可确认结果处置', 403);
  if (task.status === 'completed' && task.outcomeReview) return task;
  if (!requiresOutcomeReview(task) || !['planned', 'in_progress', 'missed'].includes(task.status) || task.aiStatus === 'pending') throw fail('当前计划不能进行结果处置');
  if (new Date(body.updatedAt).getTime() !== new Date(task.updatedAt).getTime()) throw fail('计划进度已更新，请刷新后审核');
  const note = String(body.note || '').trim();
  if (!note || note.length > 5000 || body.checksComplete !== true) throw fail('请确认本次检查资料齐全，并填写结果处置结论', 400);
  if (!['no_further', 'new_plan'].includes(body.decision)) throw fail('请选择无需继续或已有新随访计划', 400);
  const reportIds = [...new Set((Array.isArray(body.reportIds) ? body.reportIds : []).map(String))];
  if (!reportIds.length || reportIds.length > 30) throw fail('请关联本次全部报告', 400);
  const reports = await Report.find({ _id: { $in: reportIds }, user: task.patientId, audit_status: 'audited' }).lean();
  if (reports.length !== reportIds.length) throw fail('报告不属于本客户、缺失或尚未审核');
  let nextTasks = [], sourceDraft = null;
  if (body.decision === 'new_plan') {
    sourceDraft = await Draft.findById(body.reportDraftId).lean();
    if (!sourceDraft || !same(sourceDraft.patientId, task.patientId) || !reportIds.includes(String(sourceDraft.reportId))
      || sourceDraft.status !== 'approved' || !sourceDraft.advisorReviewedBy || !sourceDraft.advisorReviewedAt
      || sourceDraft.followUpPublication?.status !== 'published' || !sourceDraft.followUpDrafts?.length) throw fail('后续报告随访须已由顾问审核并完整发布');
    const report = reports.find(r => same(r._id, sourceDraft.reportId));
    if (!require('./reportFollowUpSource').isReportSourceCurrent(sourceDraft, report)) throw fail('后续计划所依据的报告已更新，请核对最新结果');
    const keys = sourceDraft.followUpDrafts.map((d, i) => `${sourceDraft._id}:dynamic:${i}:${d.date}`);
    nextTasks = await FollowUp.find({ patientId: task.patientId, sourceType: 'report_followup', sourceId: sourceDraft._id,
      assessmentActionKey: { $in: keys }, status: { $ne: 'cancelled' }, aiStatus: 'approved' }).lean();
    if (nextTasks.length !== keys.length || new Set(nextTasks.map(t => t.assessmentActionKey)).size !== keys.length
      || nextTasks.some(t => !t.assignedTo || same(t._id, task._id))) throw fail('新随访尚未完整落地或缺少负责人，原计划保持开放');
    const serviceKeys = sourceDraft.followUpDrafts.flatMap((d, i) => d.requiresService ? [`${sourceDraft._id}:service:dynamic:${i}:${d.date}`] : []);
    if (serviceKeys.length) {
      const requests = await FollowUp.find({ patientId: task.patientId, sourceType: 'report_followup', sourceId: sourceDraft._id,
        assessmentActionKey: { $in: serviceKeys }, status: { $ne: 'cancelled' }, aiStatus: 'approved', taskRole: 'supervisor' }).lean();
      if (requests.length !== serviceKeys.length || requests.some(t => !t.assignedTo)) throw fail('新计划的服务承接任务未完整落地，原计划保持开放');
    }
  }
  // The advisor attests to the exact report snapshots below. Later report
  // revisions remain new evidence, not silent rewriting of this review history.
  const proof = { decision: body.decision, note, checksComplete: true, reviewedBy: actor._id, reviewedAt: now,
    reports: reports.map(r => ({ reportId: r._id, updatedAt: r.updatedAt, sourceSequence: r.followUpSourceEvent?.sequence })),
    sourceDraftId: sourceDraft?._id || null, nextFollowUpIds: nextTasks.map(t => t._id) };
  const updated = await FollowUp.findOneAndUpdate({ _id: task._id, patientId: task.patientId, updatedAt: task.updatedAt, status: task.status,
    outcomeReview: null }, { $set: { status: 'completed', completedAt: now, completedBy: 'staff', isBlocked: false, outcomeReview: proof }, $inc: { __v: 1 } }, { new: true });
  if (!updated) throw fail('计划已更新或结果已处理，请刷新核对');
  return updated;
}
module.exports = { reviewOutcome };
