const id = value => String(value?._id || value || '')
const { preparationRole } = require('./annualCheckupEvidence')

function buildCheckupPreparationTodos(links, actor) {
  if (!['healthPlanner', 'superadmin'].includes(actor?.role)) return []
  const seen = new Set()
  return links.flatMap(link => {
    const task = link.plannerTaskId, patient = link.patientId
    const failed = link.status === 'activation_failed'
    const attention = link.status === 'active' && link.completion?.status === 'attention'
    if (!patient || !task || (!failed && !attention) || seen.has(id(link._id)) || preparationRole(task) !== 'healthPlanner'
      || id(task.patientId) !== id(patient) || id(task.sourceAnnualPlanId) !== id(link.annualPlanId)) return []
    // 原准备负责人仍需持有客户归属；改派未完成时仅超管可见，避免泄露给旧规划师。
    if (actor.role !== 'superadmin' && (id(task.assignedTo) !== id(actor._id) || id(patient.assignedHealthPlanner) !== id(actor._id))) return []
    seen.add(id(link._id))
    return [{ id: `checkup_handoff_${id(link._id)}`, type: 'checkup_handoff_attention', priority: 2,
      label: failed ? '体检承接中断待核对' : '体检完成回写待核对', patientId: id(patient), patientName: patient.name || '未知',
      taskId: id(task), summary: failed ? link.activation?.message || '请核对原服务承接状态后继续' : link.completion.message,
      createdAt: link.updatedAt || link.createdAt, overdue: false }]
  })
}
// Read-only projection; completed preparation still needs a visible handoff step.
async function buildPendingCheckupTodos(tasks, links, actor, readinessFor) {
  if (!['healthPlanner', 'superadmin'].includes(actor?.role)) return []
  const result = [], seen = new Set()
  for (const task of tasks) {
    const patient = task.patientId
    if (task.status !== 'completed' || preparationRole(task) !== 'healthPlanner' || !patient?._id
      || seen.has(id(task._id)) || (actor.role !== 'superadmin'
        && (id(task.assignedTo) !== id(actor._id) || id(patient.assignedHealthPlanner) !== id(actor._id)))) continue
    const matching = links.filter(link => id(link.plannerTaskId) === id(task._id))
    if (matching.length > 1 || (matching.length && matching[0].status !== 'linked_pending_activation')) continue
    let ready
    try { ready = await readinessFor(task._id, actor) }
    catch (error) {
      if ([403, 404, 409].includes(error.statusCode)) continue // stale ownership/source; never leak or break other todos
      throw error
    }
    if (!ready.readyForServiceLink) continue
    seen.add(id(task._id))
    result.push({ id: `checkup_pending_${id(task._id)}`, type: 'checkup_handoff_pending', priority: 2,
      label: matching.length ? '体检服务待启动' : '体检准备齐备·待关联服务', patientId: id(patient), patientName: patient.name || '未知',
      taskId: id(task._id), summary: '两岗准备及客户确认已齐备，沿用原准备记录衔接服务，不需重新录入。',
      createdAt: task.updatedAt, overdue: false })
  }
  return result
}
module.exports = { buildCheckupPreparationTodos, buildPendingCheckupTodos }
