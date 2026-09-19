const { createHash } = require('crypto')
const { buildAnnualCheckupPreparation } = require('./annualCheckupPreparation')
const enabled = () => process.env.CHECKUP_PREPARATION_AUTO_ENABLED === 'true'

function createCheckupDispatch({ AnnualPlan, User, FollowUp }, gateFor, isEnabled = enabled) {
  async function sync(input, now = new Date()) {
    if (!isEnabled() || !input?.checkupPreparationAutoConfirmedAt) return { created: 0 }
    const plan = await AnnualPlan.findById(input._id).lean()
    if (!plan?.checkupPreparationAutoConfirmedAt) return { created: 0 }
    const patient = await User.findById(plan.patientId).lean()
    const gate = await gateFor(plan, patient, now)
    const result = buildAnnualCheckupPreparation(plan, patient, gate, now)
    let created = 0
    const issues = [...result.issues]
    if (result.state === 'due' && result.tasks.length) {
      try {
        // Inspect only: never create collections/indexes while scanning production.
        const indexes = await FollowUp.collection.indexes()
        if (!indexes.some(x => x.unique && x.sparse && !x.partialFilterExpression
          && x.key?.annualDispatchKey === 1 && Object.keys(x.key).length === 1)) throw Error('年度派发唯一索引尚未就绪，请管理员核验')
        for (const row of result.tasks) {
          const filter = { sourceAnnualPlanId: plan._id, sourceType: 'annual_service', sourceScheduleKey: row.sourceScheduleKey }
          const existing = await FollowUp.find(filter).lean()
          if (existing.length) {
            if (existing.length !== 1 || String(existing[0].assignedTo) !== String(row.assignedTo)
              || existing[0].formData?.annualCheckupPreparation?.targetDate !== result.targetDate) issues.push({ role: row.formData.annualCheckupPreparation.role, code: 'existing_conflict', message: '已有准备任务的归属或排期不一致，请核对，系统不覆盖已有记录' })
            continue // completed/cancelled/manual history is never reopened
          }
          const fresh = await AnnualPlan.findById(plan._id).lean()
          const currentPatient = await User.findById(plan.patientId).lean()
          const current = buildAnnualCheckupPreparation(fresh, currentPatient, await gateFor(fresh, currentPatient, now), now)
          const currentRow = current.tasks.find(x => x.sourceScheduleKey === row.sourceScheduleKey)
          if (current.state !== 'due' || !currentRow || String(currentRow.assignedTo) !== String(row.assignedTo)
            || current.targetDate !== result.targetDate) throw Error('服务期、岗位或日期已变化，下次扫描重新核对')
          const annualDispatchKey = createHash('sha256').update(JSON.stringify([String(plan._id), 'checkup_preparation', row.sourceScheduleKey])).digest('hex')
          try {
            const saved = await FollowUp.updateOne(filter, { $setOnInsert: { ...row, annualDispatchKey } }, { upsert: true })
            created += saved.upsertedCount || 0
          } catch (error) {
            if (error.code !== 11000 || !error.keyPattern?.annualDispatchKey || !await FollowUp.exists({ ...filter, annualDispatchKey })) throw error
          }
        }
      } catch (error) {
        issues.push({ role: 'healthPlanner', code: 'dispatch_failed', message: '体检准备派发未完成，请核对索引、岗位及服务期；系统每日重试' })
      }
    }
    await AnnualPlan.updateOne({ _id: plan._id, updatedAt: plan.updatedAt, checkupPreparationAutoConfirmedAt: plan.checkupPreparationAutoConfirmedAt },
      { $set: { checkupPreparationDispatch: { state: result.state, issues, checkedAt: now } } })
    return { created, issues }
  }
  return { sync }
}
function runtime() {
  return createCheckupDispatch({ AnnualPlan: require('../models/AnnualPlan'), User: require('../models/User'), FollowUp: require('../models/FollowUp') }, require('./annualPeriodicGate').annualPeriodicGate)
}
function buildDispatchTodos(plans, staff) {
  return plans.flatMap(plan => {
    if (!plan.patientId) return []
    const issues = (plan.checkupPreparationDispatch?.issues || []).filter(x => x.code !== 'service_inactive')
    return ['healthPlanner', 'familyDoctor'].flatMap(role => {
      const rows = issues.filter(x => (x.code === 'missing_assignment' ? 'healthPlanner' : x.role) === role)
      const field = role === 'healthPlanner' ? 'assignedHealthPlanner' : 'assignedFamilyDoctor'
      if (!rows.length || (staff.role !== 'superadmin' && (staff.role !== role || String(plan.patientId[field] || '') !== String(staff._id)))) return []
      return [{ id: `checkup_dispatch_${plan._id}_${role}`, type: 'checkup_preparation_dispatch', label: '体检准备派发待核对', priority: 2,
        patientName: plan.patientId.name || '未知', patientId: String(plan.patientId._id), summary: rows.map(x => x.message).join('；'),
        createdAt: plan.checkupPreparationDispatch.checkedAt, overdue: false,
        link: `/patients/${plan.patientId._id}/annual-health?year=${plan.year}&planType=${encodeURIComponent(plan.planType)}` }]
    })
  })
}
module.exports = { createCheckupDispatch, runtime, enabled, buildDispatchTodos }
