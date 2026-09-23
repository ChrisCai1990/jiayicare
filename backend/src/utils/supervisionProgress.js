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
  if (task.annualDispatch) {
    const d = task.annualDispatch;
    return { total: 1, completed: d.status === 'completed' ? 1 : 0, current: d.status === 'completed' ? [] : [{ id: d.executionId, label: d.status === 'pending_review' ? '代办结果待规划师验收' : '已派单，等待就医专员办理', assignee: d.status === 'pending_review' ? task.assignedTo?.name || '健康规划师' : d.assigneeName, blocked: false }], message: d.status === 'completed' ? '代办已验收，原管理随访继续跟进' : '按本次派单跟进办理进度' };
  }
  const key = scope(task);
  const rows = key ? siblings.filter(row => Object.entries(key).every(([field, value]) => id(row[field]) === id(value))
    && row.taskRole !== 'supervisor' && row.status !== 'cancelled'
    && (!(task.sourceType === 'annual_service' && task.workflowKey === 'service_request') || require('../../../shared/annualServiceItem.cjs').isAssistance(row))) : [];
  const active = rows.filter(row => ['planned', 'in_progress', 'missed'].includes(row.status));
  const ready = active.filter(row => !row.isBlocked);
  const current = ready.length ? ready : active;
  return { total: rows.length, completed: rows.filter(row => row.status === 'completed').length,
    current: current.map(row => ({ id: row._id, label: task.sourceType === 'annual_service' && task.workflowKey === 'service_request' ? (require('../../../shared/annualBookingPlan.cjs').bookingReady(row.annualBooking) ? '预约安排已确认，待健康规划师派单' : '健管专员待安排预约') : row.theme || row.workflowKey || '待核对环节',
      assignee: task.sourceType === 'annual_service' && task.workflowKey === 'service_request' && require('../../../shared/annualBookingPlan.cjs').bookingReady(row.annualBooking) ? task.assignedTo?.name || '健康规划师' : row.assignedTo?.name || '未明确处理人', blocked: !!row.isBlocked })),
    message: !rows.length ? '暂无明确关联的执行进度，请核对服务承接' : !active.length ? '已生成执行任务均已结束，待核对服务是否结案'
      : ready.length ? '等待当前处理人办理' : '等待前置环节完成或资料审核' };
}
async function loadSupervisionProgress(tasks, FollowUp) {
  const supervisors = tasks.filter(task => task.taskRole === 'supervisor');
  const scopes = supervisors.map(scope).filter(Boolean);
  const rows = scopes.length ? await FollowUp.find({ $or: scopes, status: { $ne: 'cancelled' } })
    .select('patientId sourceOrderId sourceHealthPlanId sourceAnnualPlanId sourceType sourceId sourceScheduleKey deliveryMode annualBooking taskRole status isBlocked theme workflowKey assignedTo')
    .populate('assignedTo', 'name').lean() : [];
  const careIds = supervisors.map(t=>t.careFlowId).filter(Boolean);
  const cases = careIds.length ? await require('../models/CareFlow').find({_id:{$in:careIds}}).lean() : [];
  const config = require('../../../shared/careFlow.cjs');
  return new Map(supervisors.map(task => {
    const flow=cases.find(c=>id(c._id)===id(task.careFlowId));
    if(!flow)return [id(task._id),summarize(task,rows)];
    const s=flow.state,person=s.people[config.roles[s.stage]];
    return [id(task._id),{total:config.stages.length,completed:s.finalized?config.stages.length:s.stage==='closed'?config.stages.length-1:Math.max(0,config.stages.indexOf(s.stage)),current:s.finalized?[]:[{id:task._id,label:(s.stage==='closed'?'顾问已通过，待同步随访':config.labels[s.stage])+(s.returns?.length?'（退回修订）':''),assignee:person?.name||'待同步',blocked:false}],message:s.finalized?'顾问审核通过，服务结束':'按本次就医流程办理；修订后直接返回发起环节'}];
  }));
}
module.exports = { scope, summarize, loadSupervisionProgress };
