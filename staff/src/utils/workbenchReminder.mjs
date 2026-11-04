import { serviceTaskGroupKey } from './plannerOrderProgress.mjs'

export function groupServiceTasks(items) {
  return Object.values(items.reduce((result, task) => {
    const key = serviceTaskGroupKey(task)
    if (!result[key]) result[key] = { key, tasks: [] }
    result[key].tasks.push(task)
    return result
  }, {})).map(service => {
    const workflowModules = service.tasks[0]?.sourceHealthPlanId?.content?.workflowModules || []
    const sequenceByKey = new Map(workflowModules.map((item, sequence) => [String(item.id || item._id || ''), item.sequence ?? sequence]))
    service.tasks.sort((a, b) => (sequenceByKey.get(String(a.workflowKey || '')) ?? 999) - (sequenceByKey.get(String(b.workflowKey || '')) ?? 999))
    const orderService = service.tasks[0]?.sourceType === 'order'
    const supervisor = service.tasks.find(task => (orderService ? task.taskRole === 'supervisor' : task.workflowKey === 'medical_proxy:supervise') && ['planned', 'in_progress', 'missed'].includes(task.status))
    // The API returns this staff member's tasks. A read-only supervisor card must
    // not hide their actionable assignment for the same service.
    const proxyAction = service.tasks.find(task => (orderService ? task.taskRole === 'executor' && task.workflowKey !== 'medication_proxy:progress' : String(task.workflowKey || '').startsWith('medical_proxy:') && task.workflowKey !== 'medical_proxy:supervise') && !task.isBlocked && ['planned', 'in_progress', 'missed'].includes(task.status))
    return { ...service, task: service.tasks.find(task => task.workflowKey === 'system:outpatient_initial_assignment') || service.tasks.find(task => task.workflowKey === 'medical_assist:closure') || service.tasks.find(task => task.feedbackReview) || proxyAction || supervisor || service.tasks[0], totalSteps: workflowModules.length || service.tasks.length }
  })
}

export function isServiceActionable(service, now = new Date()) {
  const task = service.task
  if (task.workflowKey === 'medical_assist:closure') return true
  if (task.feedbackReview) return task.taskRole === 'executor' && !task.isBlocked
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (task.taskRole === 'supervisor') {
    // 门诊一站式由规划师全程督办；上游尚在办理时也要在默认工作台显示进度。
    if (/门诊一站式/.test(`${task.sourceHealthPlanId?.title || ''} ${task.sourceHealthPlanId?.content?.templateName || ''}`)) return true
    return new Date(task.date) < today
  }
  return task.taskRole === 'executor' && !task.isBlocked && new Date(task.date) < tomorrow
}

export function isNutritionActionable(row, role) {
  return row.status === 'awaiting_booking' && ['healthManager', 'superadmin'].includes(role)
    || row.status === 'booked' && ['nutritionist', 'superadmin'].includes(role)
    || row.status === 'completed' && row.orderSettlementStatus === 'needs_review' && ['nutritionist', 'superadmin'].includes(role)
}

// A red dot represents pending work, not unread messages. Never clear it on view.
// Independent failed sources keep their previous signal; unknown is not zero.
export function mergeReminderResults(previous, entries, results) {
  return Object.fromEntries(entries.map(([key], index) => {
    const result = results[index]
    return [key, result.status === 'fulfilled'
      ? { pending: result.value, error: false }
      : { pending: previous[key]?.pending ?? false, error: true }]
  }))
}
export function reminderState(sources) {
  const rows = Object.values(sources)
  return { pending: rows.some(row => row.pending), error: rows.some(row => row.error) }
}
