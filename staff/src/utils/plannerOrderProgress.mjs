const orderId = value => String(value?._id || value || '')

export function decisionReferralProgress(order) {
  if (order?.serviceName !== '企业家健康决策计划') return ''
  const labels = {
    intake: '待健康规划师核对客户需求',
    advisor: '规划师已登记客户需求，待健康顾问确认解析方案并发起专科转介',
    booking: '顾问已发起专科转介，待健管专员预约并联系客户',
    specialist: '预约已确认，待专科医生解析报告并回复转介',
    advisor_review: '专科已回复，待健康顾问审核归档',
    planner_final: '顾问已归档，待健康规划师最终验收',
    completed: '规划师已验收，服务结束',
  }
  return `当前环节：${labels[order.currentStage] || labels.intake}`
}

export function isCustomerOrder(order, task) {
  if (!order || typeof order !== 'object') return false
  const source = order.initiationSource || task?.formData?.initiationSource
    || task?.formData?.planSnapshot?.initiationSource || order.serviceWorkflowSnapshot?.source
  // Old paid customer orders may lack the source marker. Never infer a staff
  // service from its name or from an order reference alone.
  return source ? source === 'customer' : order.paymentStatus === 'paid'
}

export function serviceTaskGroupKey(task) {
  if (task.annualBookingTask || (task.sourceType === 'annual_service' && task.workflowKey === 'service_request')) return `request:${task._id}`
  if (task.sourceType === 'order' && orderId(task.sourceOrderId)) return `order:${orderId(task.sourceOrderId)}`
  if (['insurance_case', 'insurance_service', 'scheduled'].includes(task.sourceType) && task.sourceId
    && /高端医疗险/.test(`${task.theme || ''} ${(task.tags || []).join(' ')}`)) return `insurance:${orderId(task.sourceId)}`
  return task.coordinationGroupId || `task:${task._id}`
}

// Initial order follow-ups disappear after intake; the planner's supervisor task
// remains the source of truth for the ongoing service.
export function plannerOrderRows(pendingOrders = [], serviceTasks = []) {
  const rows = new Map()
  for (const followUp of pendingOrders) {
    if (!isCustomerOrder(followUp.sourceOrderId, followUp)) continue
    const id = orderId(followUp.sourceOrderId)
    if (id) rows.set(id, { id, pending: followUp, supervisor: null, task: null, action: null })
  }
  for (const task of serviceTasks) {
    if (task.sourceType !== 'order' || !isCustomerOrder(task.sourceOrderId, task)) continue
    const id = orderId(task.sourceOrderId)
    if (!id) continue
    const row = rows.get(id) || { id, pending: null, supervisor: null, task: null, action: null }
    const readOnlyProgress = task.workflowKey === 'medication_proxy:progress'
    row.task ||= task
    if (task.workflowKey === 'medical_assist:closure' || ((task.taskRole === 'supervisor' || readOnlyProgress) && row.supervisor?.workflowKey !== 'medical_assist:closure')) row.supervisor = task
    if (task.taskRole === 'executor' && !readOnlyProgress && !task.isBlocked && !row.action) row.action = task
    rows.set(id, row)
  }
  return [...rows.values()]
}
