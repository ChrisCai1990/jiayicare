const { randomUUID } = require('node:crypto');

// Deliberately limited to another pending item in the same customer's same plan.
// Moving service/report provenance or undoing an existing item binding needs a separate workflow.
async function prepareReportItemRelink(HealthPlan, report, targetItemId) {
  if (typeof targetItemId !== 'string' || !/^[a-f\d]{24}$/i.test(targetItemId)
    || targetItemId === String(report.planItemId)) return { error: '请选择同一方案中的其他待完成项目' };
  const plan = await HealthPlan.findOne({ _id: report.planId, patientId: report.user }).lean();
  if (!plan || ['cancelled', 'completed'].includes(plan.status)) return { error: '原方案不属于本客户、已取消或已完成，不能改关联' };
  const oldItem = plan.items?.find(item => String(item._id) === String(report.planItemId));
  if (oldItem?.reportId && String(oldItem.reportId) === String(report._id)) {
    return { error: '原项目仍绑定本报告，不能直接改关联；请先核对原执行证据' };
  }
  const target = plan.items?.find(item => String(item._id) === targetItemId);
  if (!target || target.status !== 'pending' || target.reportId) return { error: '所选项目不存在、非待完成或已有报告，请刷新后核对' };
  return { intent: { token: randomUUID(), status: 'pending', requestedAt: new Date(),
    planId: String(report.planId), itemId: targetItemId } };
}
module.exports = { prepareReportItemRelink };
