const id = value => String(value?._id || value || '');
async function validateReportPlanLink(HealthPlan, patientId, planId, itemId) {
  if (!planId && !itemId) return '';
  if (!planId || !/^[a-f\d]{24}$/i.test(id(planId)) || (itemId && !/^[a-f\d]{24}$/i.test(id(itemId)))) return '方案或检查项目编号无效';
  const plan = await HealthPlan.findOne({ _id: planId, patientId }).lean();
  if (!plan || plan.status === 'cancelled') return '关联方案不存在、已取消或不属于本客户';
  if (itemId && !(plan.items || []).some(item => id(item._id) === id(itemId))) return '检查项目不属于所选方案';
  return '';
}
async function attachReportPlanItem(HealthPlan, report) {
  if (!report.planId || !report.planItemId) return;
  return HealthPlan.updateOne({ _id: report.planId, patientId: report.user, status: { $ne: 'cancelled' },
    items: { $elemMatch: { _id: report.planItemId, status: 'pending', $or: [{ reportId: null }, { reportId: report._id }] } } },
  { $set: { 'items.$.reportId': report._id } });
}
module.exports = { validateReportPlanLink, attachReportPlanItem };
