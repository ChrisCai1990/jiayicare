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
module.exports = { buildCheckupPreparationTodos }
