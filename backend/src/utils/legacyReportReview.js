const { createHash } = require('node:crypto');
const idFor = (kind, reportId) => createHash('sha256').update(`report-audit:${kind}:${reportId}`).digest('hex').slice(0, 24);
function conflict(message) { const error = new Error(message); error.status = 409; return error; }
async function ensureLegacyReportReview({ Task, AbnormalReview, report, staff, input }) {
  if (report.audit_status !== 'audited') throw conflict('报告尚未审核，不能创建复查任务');
  const reviewId = idFor('review', report._id), taskId = idFor('task', report._id);
  const existing = await AbnormalReview.find({ reportId: report._id }).select('_id taskId').limit(2).lean();
  if (existing.some(row => String(row._id) !== reviewId || String(row.taskId) !== taskId)) {
    throw conflict('该报告已有历史复查记录，请核对原记录，不能重复派单');
  }
  const title = `${report.title || '报告'}异常复查`;
  const review = { _id: reviewId, patientId: report.user, reportId: report._id, staffId: staff._id,
    taskId, title, reviewReason: input.reviewReason || '', reviewHospital: input.reviewHospital || '',
    reviewDepartment: input.reviewDepartment || '', abnormalItems: input.abnormalItems,
    reviewDate: input.reviewDate ? new Date(input.reviewDate) : null, notes: input.notes || '' };
  // _id uniqueness is the concurrency boundary, not a read-before-create check.
  async function insertOnce(Model, id, payload) {
    try { await Model.updateOne({ _id: id }, { $setOnInsert: payload }, { upsert: true, runValidators: true, timestamps: false }); }
    catch (error) { if (error.code !== 11000 || !(await Model.exists({ _id: id }))) throw error; }
  }
  await insertOnce(AbnormalReview, reviewId, { ...review, createdAt: new Date(), updatedAt: new Date() });
  const saved = await AbnormalReview.findById(reviewId).lean();
  if (String(saved.reportId) !== String(report._id) || String(saved.patientId) !== String(report.user) || String(saved.taskId) !== taskId) {
    throw conflict('复查来源不一致，请联系管理员核对');
  }
  // Use the first durable review, never the losing/replayed request's content.
  await insertOnce(Task, taskId, { _id: taskId, user: saved.patientId, title: saved.title,
    description: saved.reviewReason || saved.notes || '', category: 'followup_abnormal', type: 'followup_abnormal',
    priority: 'high', status: 'pending', dueDate: saved.reviewDate ? new Date(saved.reviewDate).toISOString().slice(0, 10) : null,
    assignee: staff.name || staff.username || '健管师', abnormalReviewId: reviewId, createdAt: new Date(), updatedAt: new Date() });
  const savedTask = await Task.findById(taskId).lean();
  if (String(savedTask.user) !== String(saved.patientId) || String(savedTask.abnormalReviewId) !== reviewId) {
    throw conflict('复查任务来源不一致，请联系管理员核对');
  }
  return { reviewId, taskId };
}
module.exports = { ensureLegacyReportReview, idFor };
