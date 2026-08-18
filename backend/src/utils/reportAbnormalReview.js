const Task = require('../models/Task');
const AbnormalReview = require('../models/AbnormalReview');

function reportReviewSourceKey(reportId, requestId) {
  if (!reportId || !String(requestId || '').trim()) throw new Error('异常复查缺少报告或审核请求标识');
  return `${String(reportId)}:${String(requestId).trim()}`;
}

async function upsertOnce(Model, filter, update) {
  try {
    return await Model.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (error) {
    // 两个相同审核请求并发到达时，唯一索引只允许一个插入；失败方读取胜出的记录继续补链。
    if (error?.code === 11000) return Model.findOne(filter);
    throw error;
  }
}

async function ensureReportAbnormalReview({
  report,
  staff,
  requestId,
  abnormalItems,
  reviewReason = '',
  reviewHospital = '',
  reviewDepartment = '',
  reviewDate = null,
  notes = '',
}, deps = {}) {
  if (!Array.isArray(abnormalItems) || !abnormalItems.length) return null;
  const TaskModel = deps.TaskModel || Task;
  const ReviewModel = deps.ReviewModel || AbnormalReview;
  const sourceReviewRequestId = reportReviewSourceKey(report?._id, requestId);
  const staffName = staff?.name || staff?.username || '健管师';
  const title = `${report?.title || '报告'}异常复查`;
  const dueDate = reviewDate ? new Date(reviewDate).toISOString().slice(0, 10) : null;

  const review = await upsertOnce(
    ReviewModel,
    { sourceReviewRequestId },
    { $setOnInsert: {
      sourceReviewRequestId,
      patientId: report.user,
      reportId: report._id,
      staffId: staff._id,
      title,
      reviewReason,
      reviewHospital,
      reviewDepartment,
      abnormalItems,
      reviewDate: reviewDate ? new Date(reviewDate) : null,
      notes,
    } },
  );

  const task = await upsertOnce(
    TaskModel,
    { sourceReviewRequestId },
    { $setOnInsert: {
      sourceReviewRequestId,
      user: report.user,
      title,
      description: reviewReason || notes || '',
      category: 'followup_abnormal',
      type: 'followup_abnormal',
      priority: 'high',
      status: 'pending',
      dueDate,
      assignee: staffName,
      abnormalReviewId: review._id,
    } },
  );

  // 任一步中断后重试都会补齐双向引用；不会覆盖已经执行中的任务内容或复查状态。
  await Promise.all([
    ReviewModel.updateOne({ _id: review._id, taskId: { $ne: task._id } }, { $set: { taskId: task._id } }),
    TaskModel.updateOne({ _id: task._id, abnormalReviewId: { $ne: review._id } }, { $set: { abnormalReviewId: review._id } }),
  ]);
  return { review, task, sourceReviewRequestId };
}

module.exports = { reportReviewSourceKey, ensureReportAbnormalReview };
