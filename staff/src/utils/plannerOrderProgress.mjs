const orderId = value => String(value?._id || value || '')

// Initial order follow-ups disappear after intake; the planner's supervisor task
// remains the source of truth for the ongoing service.
export function plannerOrderRows(pendingOrders = [], serviceTasks = []) {
  const rows = new Map()
  for (const followUp of pendingOrders) {
    const id = orderId(followUp.sourceOrderId)
    if (id) rows.set(id, { id, pending: followUp, supervisor: null })
  }
  for (const task of serviceTasks) {
    if (task.sourceType !== 'order' || task.taskRole !== 'supervisor') continue
    const id = orderId(task.sourceOrderId)
    if (!id) continue
    const row = rows.get(id) || { id, pending: null, supervisor: null }
    row.supervisor = task
    rows.set(id, row)
  }
  return [...rows.values()]
}
