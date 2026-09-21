const { createHash, randomUUID } = require('node:crypto');
const { queueWrite } = require('./reportWriteFence');
const idFor = (kind, reportId) => createHash('sha256').update(`report-audit:${kind}:${reportId}`).digest('hex').slice(0, 24);
function conflict(message) { const error = new Error(message); error.status = 409; return error; }
async function ensureLegacyReportReview({ Task, AbnormalReview, report, staff, input }) {
  if (report.audit_status !== 'audited') throw conflict('报告尚未审核，不能创建复查任务');
  const MedicalReport = require('../models/MedicalReport');
  const token = randomUUID();
  // Persist the owner and input before target writes. Model fencing excludes either running queue.
  const claimed = await MedicalReport.findOneAndUpdate({ _id: report._id, user: report.user,
    audit_status: 'audited', updatedAt: report.updatedAt }, { $set: { legacyReviewWrite: {
      token, kind: 'legacy_review', recoveryVersion: 1, status: 'running', startedAt: new Date(), staff: { _id: staff._id, name: staff.name, username: staff.username }, input,
    } } }, { new: true }).lean();
  if (!claimed) throw conflict('报告已变化或正在处理，请刷新后重试；持续占用需管理员核查');
  return finishClaim({ Task, AbnormalReview, report: claimed });
}
// Roll FORWARD while the source remains locked. Both stable-ID targets are
// insert-only: recovery materializes them before releasing the source. Derived
// reviews retain a deletion tombstone, so a delayed insert cannot resurrect them.
async function finishClaim({ Task, AbnormalReview, report }) {
  const MedicalReport = require('../models/MedicalReport');
  const { token, staff, input } = report.legacyReviewWrite;
  const reviewId = idFor('review', report._id), taskId = idFor('task', report._id);
  const existing = await AbnormalReview.find({ reportId: report._id }).setOptions({ includeAuditDeleted: true }).select('_id taskId').limit(2).lean();
  if (existing.some(row => String(row._id) !== reviewId || String(row.taskId) !== taskId)) {
    throw conflict('该报告已有历史复查记录，请核对原记录，不能重复派单');
  }
  const title = `${report.title || '报告'}异常复查`;
  const review = { _id: reviewId, patientId: report.user, reportId: report._id, staffId: staff._id,
    taskId, taskAssigneeSnapshot: staff.name || staff.username || '健管师', title, reviewReason: input.reviewReason || '', reviewHospital: input.reviewHospital || '',
    reviewDepartment: input.reviewDepartment || '', abnormalItems: input.abnormalItems,
    reviewDate: input.reviewDate ? new Date(input.reviewDate) : null, notes: input.notes || '' };
  // _id uniqueness is the concurrency boundary, not a read-before-create check.
  async function insertOnce(Model, id, payload) {
    try { await Model.updateOne({ _id: id }, { $setOnInsert: payload }, { upsert: true, runValidators: true, timestamps: false }); }
    catch (error) { if (error.code !== 11000 || !(await Model.exists({ _id: id }))) throw error; }
  }
  await insertOnce(AbnormalReview, reviewId, { ...review, auditDispatchVersion: 1, createdAt: new Date(), updatedAt: new Date() });
  const saved = await AbnormalReview.findById(reviewId).setOptions({ includeAuditDeleted: true }).lean();
  if (String(saved.reportId) !== String(report._id) || String(saved.patientId) !== String(report.user) || String(saved.taskId) !== taskId) {
    throw conflict('复查来源不一致，请联系管理员核对');
  }
  // Use the first durable review, never the losing/replayed request's content.
  if (!saved.taskAssigneeSnapshot && !(await Task.exists({ _id: taskId }))) {
    throw conflict('历史复查缺少原任务责任人凭据，请核对后处理');
  }
  await insertOnce(Task, taskId, { _id: taskId, user: saved.patientId, title: saved.title,
    description: saved.reviewReason || saved.notes || '', category: 'followup_abnormal', type: 'followup_abnormal',
    priority: 'high', status: 'pending', dueDate: saved.reviewDate ? new Date(saved.reviewDate).toISOString().slice(0, 10) : null,
    assignee: saved.taskAssigneeSnapshot, abnormalReviewId: reviewId, createdAt: new Date(), updatedAt: new Date() });
  const savedTask = await Task.findById(taskId).lean();
  if (String(savedTask.user) !== String(saved.patientId) || String(savedTask.abnormalReviewId) !== reviewId) {
    throw conflict('复查任务来源不一致，请联系管理员核对');
  }
  const released = await queueWrite(MedicalReport.updateOne({ _id: report._id, 'legacyReviewWrite.token': token,
    'legacyReviewWrite.status': 'running' }, { $set: { 'legacyReviewWrite.status': 'completed',
      ...(report.legacyDispatchIntent?.status === 'pending' ? { 'legacyDispatchIntent.status': 'completed',
        'legacyDispatchIntent.completedAt': new Date(), 'legacyDispatchIntent.outcome': 'legacy_review' } : {}),
      'legacyReviewWrite.finishedAt': new Date(), 'legacyReviewWrite.reviewId': reviewId, 'legacyReviewWrite.taskId': taskId } }));
  if (released.modifiedCount !== 1 && !await MedicalReport.exists({ _id: report._id,
    'legacyReviewWrite.token': token, 'legacyReviewWrite.status': 'completed' })) throw conflict('复查已写入但回执未确认，请核查处理状态');
  return { reviewId, taskId };
}
async function recoverLegacyClaim(row) {
  const claim = row.legacyReviewWrite;
  if (claim?.kind !== 'legacy_review' || claim.recoveryVersion !== 1 || claim.status !== 'running'
      || row.legacyDispatchIntent?.status !== 'pending' || !claim.staff?._id || !claim.input?.abnormalItems?.length) return false;
  const MedicalReport = require('../models/MedicalReport');
  const current = await MedicalReport.findOne({ _id: row._id, audit_status: 'audited',
    'legacyReviewWrite.token': claim.token, 'legacyReviewWrite.status': 'running',
    'legacyDispatchIntent.token': row.legacyDispatchIntent.token, 'legacyDispatchIntent.status': 'pending' }).lean();
  if (!current) return false;
  const Review = require('../models/AbnormalReview');
  const existing = await Review.findById(idFor('review', row._id)).setOptions({ includeAuditDeleted: true }).lean();
  if (existing && existing.auditDispatchVersion !== 1) return false; // Old writers/deletions were not fenced.
  await finishClaim({ report: current, Task: require('../models/Task'), AbnormalReview: Review });
  return true;
}
module.exports = { ensureLegacyReportReview, recoverLegacyClaim, idFor };
