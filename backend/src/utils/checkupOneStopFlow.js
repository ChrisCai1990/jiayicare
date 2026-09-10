const FollowUp = require('../models/FollowUp')
const FollowUpPlan = require('../models/FollowUpPlan')
const HealthPlan = require('../models/HealthPlan')
const Order = require('../models/Order')
const User = require('../models/User')

function isCheckupService(plan) {
  const c = plan?.content || {}
  return plan?.type === 'medical_assist' && (c.serviceDomain === 'annual_checkup'
    || c.templateSnapshot?.serviceDomain === 'annual_checkup'
    || /体检/.test(`${c.templateName || ''} ${plan.title || ''}`))
}

function addBusinessDays(value, count) {
  const date = new Date(value)
  let remaining = Number(count) || 0
  while (remaining > 0) {
    date.setDate(date.getDate() + 1)
    if (![0, 6].includes(date.getDay())) remaining -= 1
  }
  return date
}

async function findCheckupServicePlan(patientId) {
  const candidates = await HealthPlan.find({ patientId, type: 'medical_assist', status: { $in: ['active', 'draft'] } }).sort({ pushedAt: -1, createdAt: -1 })
  return candidates.find(isCheckupService) || null
}

async function ensureCheckupTasks(servicePlan) {
  if (!isCheckupService(servicePlan)) return {}
  const c = servicePlan.content || {}
  const ids = (c.followUpPlans?.length ? c.followUpPlans.map(item => item.id || item._id) : [c.followUpPlanId]).filter(Boolean)
  const schemes = await FollowUpPlan.find({ _id: { $in: ids }, status: 'active', reviewStatus: { $ne: 'pending_review' } }).lean()
  const patient = await User.findById(servicePlan.patientId).select('assignedFamilyDoctor assignedHealthPlanner assignedMedicalAssistant assignedHealthManager').lean()
  const serviceDate = c.serviceDate ? new Date(`${c.serviceDate}T${/^\d{2}:\d{2}/.test(c.serviceTime || '') ? c.serviceTime.slice(0, 5) : '09:00'}:00+08:00`) : new Date()
  const assignees = { familyDoctor: c.reviewerId || patient?.assignedFamilyDoctor, healthPlanner: c.bookingPlannerId || patient?.assignedHealthPlanner, medicalAssistant: c.escortStaffId || patient?.assignedMedicalAssistant, healthManager: patient?.assignedHealthManager }
  const stageForScheme = scheme => scheme.executorRole === 'familyDoctor' ? 'plan_design'
    : scheme.executorRole === 'healthPlanner' ? 'booking'
      : scheme.executorRole === 'medicalAssistant' ? 'onsite'
        : scheme.executorRole === 'healthManager' && /报告.*(?:回收|获取|归档)/.test(scheme.name || '') ? 'report_collection'
          : ''
  const result = {}
  for (const scheme of schemes.filter(stageForScheme)) {
    const stage = stageForScheme(scheme)
    const assignedTo = assignees[scheme.executorRole]
    if (!assignedTo) continue
    const date = stage === 'onsite' ? serviceDate : stage === 'report_collection' ? addBusinessDays(serviceDate, 7) : new Date()
    const task = await FollowUp.findOneAndUpdate(
      { sourceHealthPlanId: servicePlan._id, sourceType: 'health_plan', taskRole: 'executor', workflowKey: String(scheme._id) },
      { $setOnInsert: { patientId: servicePlan.patientId, staffId: servicePlan.staffId, assignedTo, followUpSchemeId: scheme._id, coordinationGroupId: `checkup:${servicePlan._id}`, sourceHealthPlanId: servicePlan._id, sourceType: 'health_plan', taskRole: 'executor', workflowKey: String(scheme._id), theme: scheme.name, plannedContent: scheme.completionStandard || '', date, remindAt: date, status: 'planned', isBlocked: stage !== 'plan_design', activationEvent: '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    result[stage] = task
  }
  return result
}

async function onCustomerConfirmedCheckupPlan(patientId) {
  const servicePlan = await findCheckupServicePlan(patientId)
  if (!servicePlan) return null
  const tasks = await ensureCheckupTasks(servicePlan)
  const annualPlanIds = await HealthPlan.find({ patientId, type: 'annual_checkup', confirmedAt: { $ne: null } }).distinct('_id')
  await FollowUp.updateMany(
    { sourceHealthPlanId: { $in: annualPlanIds }, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'cancelled', cancelReason: '客户确认体检方案后转入一站式预约流程' } }
  )
  await FollowUp.updateMany(
    { sourceHealthPlanId: servicePlan._id, assignedTo: servicePlan.content?.reviewerId, taskRole: 'executor', status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'completed', completedAt: new Date(), completedBy: 'staff', isBlocked: false, executedContent: '体检方案已由客户确认' } }
  )
  if (tasks.booking) await FollowUp.updateOne(
    { _id: tasks.booking._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { isBlocked: false, status: 'in_progress', date: new Date(), remindAt: new Date(), activationEvent: '' } }
  )
  const bookingCompleted = tasks.booking?.status === 'completed'
  const onsiteCompleted = tasks.onsite?.status === 'completed'
  if (tasks.onsite && !bookingCompleted) {
    await FollowUp.updateOne(
      { _id: tasks.onsite._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
      { $set: { isBlocked: true, status: 'planned', activationEvent: 'booking_completed' } }
    )
  }
  if (tasks.report_collection && !onsiteCompleted) {
    await FollowUp.updateOne(
      { _id: tasks.report_collection._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
      { $set: { isBlocked: true, status: 'planned', activationEvent: 'onsite_completed' } }
    )
  }
  return servicePlan
}

async function advanceCheckupTask(followUp) {
  if (followUp.status !== 'completed' || !followUp.sourceHealthPlanId || !followUp.followUpSchemeId) return false
  const [servicePlan, scheme] = await Promise.all([HealthPlan.findById(followUp.sourceHealthPlanId), FollowUpPlan.findById(followUp.followUpSchemeId).lean()])
  if (!isCheckupService(servicePlan) || !scheme) return false
  const tasks = await ensureCheckupTasks(servicePlan)
  if (scheme.executorRole === 'healthPlanner' && tasks.onsite) {
    const appointment = Array.isArray(followUp.serviceChecklist) ? followUp.serviceChecklist[0]?.appointmentDetails : null
    const appointmentAt = appointment?.appointmentDate
      ? new Date(`${appointment.appointmentDate}T${appointment.appointmentTime || '09:00'}:00+08:00`)
      : tasks.onsite.date
    await FollowUp.updateOne({ _id: tasks.onsite._id }, { $set: {
      isBlocked: false,
      status: 'planned',
      activationEvent: '',
      date: appointmentAt,
      remindAt: appointmentAt,
      nextFollowUpDate: appointmentAt,
      serviceChecklist: followUp.serviceChecklist || [],
      plannedContent: followUp.executedContent || followUp.content || '',
    } })
    return true
  }
  if (scheme.executorRole === 'medicalAssistant' && tasks.report_collection) {
    await FollowUp.updateOne({ _id: tasks.report_collection._id }, { $set: { isBlocked: false, status: 'planned', activationEvent: '' } })
    return true
  }
  if (scheme.executorRole === 'healthManager' && /报告.*(?:回收|获取|归档)/.test(scheme.name || '')) {
    const remaining = await FollowUp.countDocuments({
      sourceHealthPlanId: servicePlan._id,
      sourceType: 'health_plan',
      taskRole: 'executor',
      status: { $nin: ['completed', 'cancelled'] },
    })
    if (remaining === 0) {
      const completedAt = new Date()
      await HealthPlan.updateOne({ _id: servicePlan._id }, { $set: {
        status: 'completed',
        'content.workflowCompletedAt': completedAt,
        'content.workflowCompletedBy': followUp.assignedTo || followUp.staffId,
      } })
      if (servicePlan.sourceOrderId) {
        // 一站式单次服务以整条岗位链闭环为订单完成点；多次权益仍由逐次核销规则管理。
        await Order.updateOne(
          { _id: servicePlan.sourceOrderId, totalUnits: { $lte: 1 }, status: { $nin: ['completed', 'cancelled'] } },
          { $set: { status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt, usedUnits: 1 } },
        )
      }
    }
    return true
  }
  return false
}

module.exports = { addBusinessDays, ensureCheckupTasks, onCustomerConfirmedCheckupPlan, advanceCheckupTask, isCheckupService }
