// 服务关联先把年度事项标记为已开始，封住“关联已写、任务投影尚未写”的并发窗口。
// 中途失败保留已开始状态；原关联入口仍可继续，不倒退为待执行来允许改期。
async function startAnnualServiceLink(task, parent, Model = require('../models/FollowUp')) {
  if (!task.sourceAnnualPlanId) return;
  for (const row of [task, parent]) {
    if (!row.date || !row.updatedAt) throw Object.assign(new Error('年度任务版本缺失，请刷新后核对'), { statusCode: 409 });
    const result = await Model.updateOne({ _id: row._id, patientId: task.patientId, sourceAnnualPlanId: task.sourceAnnualPlanId, status: { $in: ['planned', 'in_progress', 'missed'] }, date: row.date, updatedAt: row.updatedAt, 'serviceTracking.linkId': null }, { $set: { status: 'in_progress' } });
    if (!result.matchedCount) throw Object.assign(new Error('任务已改期、执行或关联，请刷新后重新选择服务'), { statusCode: 409 });
  }
}
module.exports = { startAnnualServiceLink };
