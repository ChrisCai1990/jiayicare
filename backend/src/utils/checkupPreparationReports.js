// Only explicit preparation handoffs participate. Never infer a latest service.
const same = (a, b) => Boolean(a && b && String(a) === String(b))

function createPreparationReportSync({ Handoff, HealthPlan, FollowUp, FollowUpPlan, MedicalReport, User, Order }) {
  async function reconcile(link) {
    if (!require('./healthManagementRollout').enabledForPatient(link?.patientId)) return false
    if (link?.status !== 'active') return false
    const service = await HealthPlan.findById(link.servicePlanId).lean()
    if (!service || !same(service.patientId, link.patientId) || service.type !== 'medical_assist'
      || service.status !== 'active' || !service.pushedAt
      || ['pending', 'rejected'].includes(service.content?.aiStatus)
      || service.supervisionStatus === 'cancelled' || service.content?.workflowCompletedAt
      || service.content?.serviceDomain !== 'annual_checkup') return false
    if (service.sourceOrderId) {
      if (!await Order.findOne({ _id: service.sourceOrderId, user: link.patientId, orderType: 'service',
        ...require('./orderWorkItem').activeOrderWorkItemQuery() }).lean()) return false
    } else if (service.initiationSource !== 'staff' || !service.initiatedByStaff) return false
    const ids = (service.content?.followUpPlans?.length
      ? service.content.followUpPlans.map(x => x.id || x._id) : [service.content?.followUpPlanId]).filter(Boolean)
    const schemes = await FollowUpPlan.find({ _id: { $in: ids }, status: 'active', reviewStatus: { $ne: 'pending_review' } }).lean()
    const collectionSchemes = schemes.filter(x => x.workflowStageKey === 'report_collection' && x.executorRole === 'healthManager')
    const reviewSchemes = schemes.filter(x => x.workflowStageKey === 'result_review' && x.executorRole === 'familyDoctor')
    if (collectionSchemes.length !== 1 || reviewSchemes.length !== 1) return false
    const tasks = await FollowUp.find({ sourceHealthPlanId: service._id, patientId: link.patientId, sourceType: 'health_plan', taskRole: 'executor' }).lean()
    const matches = scheme => tasks.filter(x => same(x.followUpSchemeId, scheme._id) && String(x.workflowKey) === String(scheme._id))
    const collections = matches(collectionSchemes[0]), reviews = matches(reviewSchemes[0])
    if (collections.length !== 1 || reviews.length !== 1) return false
    const collection = collections[0], review = reviews[0]
    if (collection.status !== 'completed' || !same(review.dependsOnTaskId, collection._id)) return false
    const closure = collection.serviceChecklist?.[0]
    const reportIds = [...new Set([...(Array.isArray(closure?.reportIds) ? closure.reportIds : []), closure?.reportId].filter(Boolean).map(String))]
    if (!closure?.serviceReviewed || closure.collectionStatus !== 'complete' || !reportIds.length
      || !Array.isArray(closure.itemChecks) || !closure.itemChecks.length
      || closure.itemChecks.some(x => !['completed', 'not_completed'].includes(x?.status))) return false
    const reports = await MedicalReport.find({ _id: { $in: reportIds }, user: link.patientId, audit_status: 'audited' }).lean()
    if (reports.length !== reportIds.length || reports.some(report => {
      const references = [report.planId, report.sourceHealthPlanId].filter(Boolean)
      return !references.length || references.some(id => !same(id, link._id) && !same(id, service._id))
        || (report.sourceOrderId && !same(report.sourceOrderId, service.sourceOrderId))
    })) return false
    const patient = await User.findById(link.patientId).lean()
    if (!same(review.assignedTo, patient?.assignedFamilyDoctor)) return false
    // Completed/cancelled/running tasks are never reopened or reset by a replay.
    if (!['planned', 'missed'].includes(review.status)) return false
    if (!await Handoff.exists({ _id: link._id, servicePlanId: service._id, patientId: link.patientId, status: 'active' })) return false
    const now = new Date()
    const result = await FollowUp.updateOne({ _id: review._id, updatedAt: review.updatedAt,
      status: review.status, assignedTo: review.assignedTo, dependsOnTaskId: collection._id,
      sourceHealthPlanId: service._id, isBlocked: review.isBlocked }, { $set: {
      isBlocked: false, status: 'in_progress', activationEvent: '', date: now, remindAt: now, nextFollowUpDate: now,
    } })
    return result.modifiedCount === 1
  }
  async function forPlan(planId, patientId) {
    if (!require('./healthManagementRollout').enabledForPatient(patientId)) return { handled: false, activated: false }
    const link = await Handoff.findOne({ patientId, $or: [{ _id: planId }, { servicePlanId: planId }] }).lean()
    return link ? { handled: true, activated: await reconcile(link) } : { handled: false, activated: false }
  }
  async function scan() {
    for await (const link of Handoff.find({ ...require('./healthManagementRollout').patientFilter(), status: 'active' }).lean().cursor()) {
      try { await reconcile(link) } catch (error) { console.error('[checkup-preparation-reports]', String(link._id), error.message) }
    }
  }
  return { reconcile, forPlan, scan }
}

function runtime() {
  return createPreparationReportSync({
    Handoff: require('../models/CheckupPreparationHandoff'), HealthPlan: require('../models/HealthPlan'),
    FollowUp: require('../models/FollowUp'), FollowUpPlan: require('../models/FollowUpPlan'),
    MedicalReport: require('../models/MedicalReport'), User: require('../models/User'),
    Order: require('../models/Order'),
  })
}
module.exports = { createPreparationReportSync, runtime }
