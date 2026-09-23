// Read-only actual-task projection. Never repairs orders or advances services.
const id = value => String(value?._id || value || '');
function scope(task) {
  const patientId = task.patientId?._id || task.patientId;
  if (task.sourceType === 'annual_service' && task.workflowKey === 'service_request') {
    const key = require('../../../shared/annualServiceItem.cjs').followUpKey(task);
    return key && task.sourceAnnualPlanId ? { patientId, sourceAnnualPlanId: task.sourceAnnualPlanId?._id || task.sourceAnnualPlanId, sourceType: 'scheduled', sourceScheduleKey: key } : null;
  }
  for (const field of ['sourceOrderId', 'sourceHealthPlanId', 'sourceAnnualPlanId']) {
    if (task[field]) return { patientId, [field]: task[field]._id || task[field] };
  }
  if (task.sourceId && ['professional_assessment', 'report_followup'].includes(task.sourceType)) return { patientId, sourceType: task.sourceType, sourceId: task.sourceId };
  return null;
}
function summarize(task, siblings) {
  const key = scope(task);
  const rows = key ? siblings.filter(row => Object.entries(key).every(([field, value]) => id(row[field]) === id(value))
    && row.taskRole !== 'supervisor' && row.status !== 'cancelled'
    && (!(task.sourceType === 'annual_service' && task.workflowKey === 'service_request') || require('../../../shared/annualServiceItem.cjs').isAssistance(row))) : [];
  const active = rows.filter(row => ['planned', 'in_progress', 'missed'].includes(row.status));
  const ready = active.filter(row => !row.isBlocked);
  const current = ready.length ? ready : active;
  return { total: rows.length, completed: rows.filter(row => row.status === 'completed').length,
    current: current.map(row => ({ id: row._id, label: task.sourceType === 'annual_service' && task.workflowKey === 'service_request' ? (row.annualBooking?.status === 'booked' ? '预约已完成，待健康规划师派单' : '健管专员待安排预约') : row.theme || row.workflowKey || '待核对环节',
      assignee: row.assignedTo?.name || '未明确处理人', blocked: !!row.isBlocked })),
    message: !rows.length ? '暂无明确关联的执行进度，请核对服务承接' : !active.length ? '已生成执行任务均已结束，待核对服务是否结案'
      : ready.length ? '等待当前处理人办理' : '等待前置环节完成或资料审核' };
}
async function loadSupervisionProgress(tasks, FollowUp) {
  const supervisors = tasks.filter(task => task.taskRole === 'supervisor');
  const scopes = supervisors.map(scope).filter(Boolean);
  const rows = scopes.length ? await FollowUp.find({ $or: scopes, status: { $ne: 'cancelled' } })
    .select('patientId sourceOrderId sourceHealthPlanId sourceAnnualPlanId sourceType sourceId sourceScheduleKey deliveryMode annualBooking taskRole status isBlocked theme workflowKey assignedTo')
    .populate('assignedTo', 'name').lean() : [];
  return new Map(supervisors.map(task => [id(task._id), summarize(task, rows)]));
}
module.exports = { scope, summarize, loadSupervisionProgress };
