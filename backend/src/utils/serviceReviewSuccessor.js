const { createHash } = require('node:crypto');
const fail = message => Object.assign(new Error(message), { statusCode: 409 });
function successorSpec(review, patient) {
  const result = review.formData || {};
  if (review.status !== 'completed' || !review.sourceHealthPlanId || !review.completedAt
    || String(review.patientId) !== String(patient?._id) || !patient.assignedHealthManager) {
    throw fail('服务审核或健管归属未齐全，不能发布后续随访');
  }
  const date = String(result.followUpDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date || !String(result.followUpContent || '').trim()) {
    throw fail('后续随访日期或内容不完整');
  }
  return {
    _id: createHash('sha256').update(`outpatient-review-successor:${review._id}`).digest('hex').slice(0, 24),
    patientId: review.patientId, staffId: review.assignedTo || review.staffId,
    assignedTo: patient.assignedHealthManager, date: new Date(date), nextFollowUpDate: new Date(date),
    type: 'other', status: 'planned', theme: '门诊一站式服务后续随访',
    content: result.followUpContent, plannedContent: result.followUpContent,
    sourceType: 'scheduled', continuityRequired: true,
    formData: { category: 'review', sourceReviewTaskId: String(review._id), sourceServicePlanId: String(review.sourceHealthPlanId) },
    completedAt: null, completedBy: null,
    createdAt: review.completedAt, updatedAt: review.completedAt,
  };
}
async function ensureServiceReviewSuccessor({ FollowUp, review, patient }) {
  const spec = successorSpec(review, patient);
  // Stable primary key needs no new index; never rewrite an existing task's
  // progress, owner or manual changes when the service completion is retried.
  let saved;
  try {
    saved = await FollowUp.findOneAndUpdate({ _id: spec._id }, { $setOnInsert: spec },
      { upsert: true, new: true, setDefaultsOnInsert: true, timestamps: false });
  } catch (error) {
    if (error.code !== 11000) throw error;
    saved = await FollowUp.findById(spec._id);
  }
  if (!saved || String(saved.patientId) !== String(spec.patientId)
    || saved.formData?.sourceReviewTaskId !== String(review._id)
    || saved.formData?.sourceServicePlanId !== String(review.sourceHealthPlanId)
    || saved.status === 'cancelled') throw fail('后续随访来源冲突或已取消，请核对，不能重建');
  return saved;
}
module.exports = { successorSpec, ensureServiceReviewSuccessor };
