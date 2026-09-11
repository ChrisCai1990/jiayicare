const FollowUp = require('../models/FollowUp')
const FollowUpPlan = require('../models/FollowUpPlan')
const HealthPlan = require('../models/HealthPlan')
const Order = require('../models/Order')
const User = require('../models/User')

const LEGACY_STAGE_RULES = [
  ['report_collection', scheme => scheme.executorRole === 'healthManager' && /报告.*(?:回收|获取|归档)/.test(scheme.name || '')],
  ['plan_design', scheme => scheme.executorRole === 'familyDoctor'],
  ['booking', scheme => scheme.executorRole === 'healthPlanner'],
  ['onsite', scheme => scheme.executorRole === 'medicalAssistant'],
]

function stageForScheme(scheme) {
  if (scheme.workflowStageKey) return scheme.workflowStageKey
  return LEGACY_STAGE_RULES.find(([, matches]) => matches(scheme))?.[0] || ''
}

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

async function findCheckupServicePlan(patientId, serviceInstanceId = null) {
  if (serviceInstanceId) {
    const exact = await HealthPlan.findOne({ _id: serviceInstanceId, patientId, type: 'medical_assist' })
    if (isCheckupService(exact)) return exact
  }
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
  const result = {}
  for (const scheme of schemes.filter(stageForScheme)) {
    const stage = stageForScheme(scheme)
    const assignedTo = assignees[scheme.executorRole]
    if (!assignedTo) continue
    const taskRole = scheme.workflowTaskRole || 'executor'
    const date = stage === 'onsite' ? serviceDate
      : ['report_collection', 'result_review', 'final_acceptance'].includes(stage) ? addBusinessDays(serviceDate, Number(scheme.executorDueOffsetDays ?? 7))
        : new Date()
    const task = await FollowUp.findOneAndUpdate(
      { sourceHealthPlanId: servicePlan._id, sourceType: 'health_plan', taskRole, workflowKey: String(scheme._id) },
      { $setOnInsert: { patientId: servicePlan.patientId, staffId: servicePlan.staffId, assignedTo, followUpSchemeId: scheme._id, coordinationGroupId: `checkup:${servicePlan._id}`, sourceHealthPlanId: servicePlan._id, sourceType: 'health_plan', taskRole, workflowKey: String(scheme._id), theme: scheme.name, plannedContent: scheme.completionStandard || '', date, remindAt: date, status: 'planned', isBlocked: stage !== 'plan_design', activationEvent: scheme.activationEvent || '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    result[stage] = task
  }
  const chain = ['plan_design', 'booking', 'onsite', 'report_collection', 'result_review', 'final_acceptance']
  for (let index = 1; index < chain.length; index += 1) {
    const current = result[chain[index]], previous = result[chain[index - 1]]
    if (current && previous && String(current.dependsOnTaskId || '') !== String(previous._id)) {
      await FollowUp.updateOne({ _id: current._id }, { $set: { dependsOnTaskId: previous._id } })
      current.dependsOnTaskId = previous._id
    }
  }
  return result
}

async function onCustomerConfirmedCheckupPlan(planOrPatientId) {
  const patientId = planOrPatientId?.patientId || planOrPatientId
  const serviceInstanceId = planOrPatientId?.content?.serviceInstanceId || null
  const servicePlan = await findCheckupServicePlan(patientId, serviceInstanceId)
  if (!servicePlan) return null
  const tasks = await ensureCheckupTasks(servicePlan)
  const annualPlanIds = await HealthPlan.find({ patientId, type: 'annual_checkup', confirmedAt: { $ne: null } }).distinct('_id')
  await FollowUp.updateMany(
    { sourceHealthPlanId: { $in: annualPlanIds }, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { status: 'cancelled', cancelReason: '客户确认体检方案后转入一站式预约流程' } }
  )
  await FollowUp.updateMany(
    { _id: tasks.plan_design?._id, sourceHealthPlanId: servicePlan._id, taskRole: 'executor', status: { $in: ['planned', 'in_progress', 'missed'] } },
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
  if (tasks.result_review) await FollowUp.updateOne(
    { _id: tasks.result_review._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { isBlocked: true, status: 'planned', activationEvent: 'report_audited' } }
  )
  if (tasks.final_acceptance) await FollowUp.updateOne(
    { _id: tasks.final_acceptance._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
    { $set: { isBlocked: true, status: 'planned', activationEvent: 'result_review_completed' } }
  )
  return servicePlan
}

async function activateResultReview(servicePlan) {
  const tasks = await ensureCheckupTasks(servicePlan)
  if (!tasks.result_review) return false
  const reportCollectionDone = !tasks.report_collection || tasks.report_collection.status === 'completed'
  if (!reportCollectionDone) return false
  await FollowUp.updateOne(
    { _id: tasks.result_review._id, status: { $in: ['planned', 'missed'] } },
    { $set: { isBlocked: false, status: 'in_progress', activationEvent: '', date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date() } }
  )
  return true
}

async function onCheckupReportAudited(report) {
  const patientId = report?.user?._id || report?.user
  if (!patientId) return false
  let annualPlan = null, servicePlan = null
  const linkedPlanId = report.planId || report.sourceHealthPlanId
  if (linkedPlanId) {
    const linkedPlan = await HealthPlan.findOne({ _id: linkedPlanId, patientId })
    if (isCheckupService(linkedPlan)) servicePlan = linkedPlan
    else if (linkedPlan?.type === 'annual_checkup') annualPlan = linkedPlan
  }
  if (!annualPlan) annualPlan = await HealthPlan.findOne({ patientId, type: 'annual_checkup', confirmedAt: { $ne: null } }).sort({ confirmedAt: -1 }).lean()
  if (!servicePlan && report.sourceOrderId) servicePlan = await HealthPlan.findOne({ patientId, type: 'medical_assist', sourceOrderId: report.sourceOrderId, status: { $in: ['draft', 'active'] } })
  if (!servicePlan) servicePlan = await findCheckupServicePlan(patientId, annualPlan?.content?.serviceInstanceId)
  if (!servicePlan) return false
  await HealthPlan.updateOne({ _id: servicePlan._id }, { $set: { 'content.reportAuditedAt': new Date(), 'content.reportAuditedId': report._id } })
  servicePlan.content = { ...(servicePlan.content || {}), reportAuditedAt: new Date(), reportAuditedId: report._id }
  return activateResultReview(servicePlan)
}

async function closeCheckupService(servicePlan, followUp) {
  const completedAt = new Date()
  await HealthPlan.updateOne({ _id: servicePlan._id }, { $set: {
    status: 'completed',
    'content.workflowCompletedAt': completedAt,
    'content.workflowCompletedBy': followUp.assignedTo || followUp.staffId,
  } })
  if (servicePlan.sourceOrderId) await Order.updateOne(
    { _id: servicePlan.sourceOrderId, totalUnits: { $lte: 1 }, status: { $nin: ['completed', 'cancelled'] } },
    { $set: { status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt, usedUnits: 1 } },
  )
}

async function advanceCheckupTask(followUp) {
  if (followUp.status !== 'completed' || !followUp.sourceHealthPlanId || !followUp.followUpSchemeId) return false
  const [servicePlan, scheme] = await Promise.all([HealthPlan.findById(followUp.sourceHealthPlanId), FollowUpPlan.findById(followUp.followUpSchemeId).lean()])
  if (!isCheckupService(servicePlan) || !scheme) return false
  const tasks = await ensureCheckupTasks(servicePlan)
  const stage = stageForScheme(scheme)
  if (stage === 'booking' && tasks.onsite) {
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
      serviceChecklist: (followUp.serviceChecklist || []).map(item => ({
        ...item,
        handoffSummary: item.executionResult || '',
        executionStatus: '',
        executionResult: '',
        nextAction: '',
      })),
      plannedContent: followUp.executedContent || followUp.content || '',
    } })
    return true
  }
  if (stage === 'onsite' && tasks.report_collection) {
    await FollowUp.updateOne({ _id: tasks.report_collection._id }, { $set: { isBlocked: false, status: 'planned', activationEvent: '' } })
    return true
  }
  if (stage === 'report_collection') {
    if (servicePlan.content?.reportAuditedAt) await activateResultReview(servicePlan)
    return true
  }
  if (stage === 'result_review' && tasks.final_acceptance) {
    await FollowUp.updateOne({ _id: tasks.final_acceptance._id, status: { $in: ['planned', 'missed'] } }, { $set: { isBlocked: false, status: 'in_progress', activationEvent: '', date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date() } })
    return true
  }
  if (stage === 'final_acceptance' && (scheme.closesService || scheme.workflowTaskRole === 'supervisor')) {
    await closeCheckupService(servicePlan, followUp)
    return true
  }
  return false
}

module.exports = { addBusinessDays, ensureCheckupTasks, onCustomerConfirmedCheckupPlan, onCheckupReportAudited, advanceCheckupTask, isCheckupService, stageForScheme }
