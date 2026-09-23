const orderId = value => String(value?._id || value || '')

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
    row.task ||= task
    if (task.taskRole === 'supervisor') row.supervisor = task
    if (task.taskRole === 'executor' && !task.isBlocked && !row.action) row.action = task
    rows.set(id, row)
  }
  return [...rows.values()]
}
