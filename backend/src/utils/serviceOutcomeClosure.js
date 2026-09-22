const { sourceDigest } = require('./reportFollowUpSource');
const { requiresOutcomeReview } = require('./followUpContinuity');
const { successorSpec } = require('./serviceReviewSuccessor');
const same = (a, b) => String(a || '') === String(b || '');
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
async function closeServiceOriginal({ FollowUp, Report, Link, review, patient, actor, fence = require('./outcomeEvidenceFence').fencedClose }) {
  const links = await Link.find({ patientId: review.patientId, targetType: 'health_plan', targetId: review.sourceHealthPlanId, status: { $in: ['waiting', 'completed'] } }).lean();
  if (!links.length) return null;
  if (links.length !== 1) throw fail('服务关联多个原计划，请核对，不能猜测结案');
  const link = links[0], task = await FollowUp.findById(link.followUpId).lean();
  if (!task || !same(task.patientId, review.patientId)) throw fail('原随访来源不一致');
  const models = { FollowUp, Report, Link };
  if (task.status === 'completed' && same(task.outcomeReview?.sourceServiceReviewId, review._id)) {
    await require('./outcomeEvidenceFence').releaseEvidence(models, task.outcomeClosureIntent);
    return task;
  }
  if (!requiresOutcomeReview(task)) return null;
  if (!['planned', 'in_progress', 'missed'].includes(task.status) || task.aiStatus === 'pending') throw fail('原随访不可结案');
  if (review.status !== 'completed' || review.formData?.checksComplete !== true
    || (actor.role !== 'superadmin' && (!same(patient.assignedFamilyDoctor, actor._id) || !same(review.assignedTo, actor._id)))) throw fail('缺少顾问完整资料确认');
  const snapshots = review.formData?.reviewedReportSources;
  if (!snapshots?.length) throw fail('缺少本次已审核报告来源');
  const reports = await Report.find({ _id: { $in: snapshots.map(x => x.id) }, user: review.patientId, audit_status: 'audited' }).lean();
  if (reports.length !== snapshots.length || reports.some(r => !same(r.sourceHealthPlanId, review.sourceHealthPlanId)
    || snapshots.find(s => same(s.id, r._id))?.digest !== sourceDigest(r))) throw fail('报告已更新或撤审，原计划保留待核对');
  const next = await FollowUp.findById(successorSpec(review, patient)._id).lean();
  if (!next || next.status === 'cancelled' || !same(next.patientId, task.patientId) || !same(next.assignedTo, patient.assignedHealthManager)
    || next.formData?.sourceReviewTaskId !== String(review._id)
    || next.plannedContent !== review.formData.followUpContent
    || new Date(next.date).getTime() !== new Date(review.formData.followUpDate).getTime()) throw fail('后续随访尚未完整落地或已修改，请核对');
  const body = { serviceReviewId: String(review._id), updatedAt: task.updatedAt };
  const proof = { decision: 'new_plan', checksComplete: true, note: review.formData.reviewSummary, reviewedBy: actor._id,
    reviewedAt: review.completedAt, sourceServiceReviewId: review._id, nextFollowUpIds: [next._id],
    reports: reports.map(r => ({ reportId: r._id, updatedAt: r.updatedAt })) };
  return fence({ models, task, actor, body, now: new Date(), proof,
    evidence: [{ model: 'Link', row: link }, { model: 'FollowUp', row: review }, { model: 'FollowUp', row: next }, ...reports.map(row => ({ model: 'Report', row }))] });
}
module.exports = { closeServiceOriginal };
