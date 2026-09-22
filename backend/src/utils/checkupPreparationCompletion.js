const same = (a, b) => Boolean(a && b && String(a) === String(b))

function createPreparationCompletion({ Handoff, HealthPlan, FollowUp, FollowUpPlan, User, Order,
  requiresOutcomeReview = require('./followUpContinuity').requiresOutcomeReview, closeReviewedOriginal }) {
  async function reconcile(link) {
    if (link?.status !== 'active' || link.completion?.status === 'completed') return false
    const service = await HealthPlan.findById(link.servicePlanId).lean()
    if (!service || !['active', 'completed'].includes(service.status)) return false
    const guard = { _id: link._id, status: 'active', servicePlanId: link.servicePlanId, 'completion.status': { $ne: 'completed' } }
    async function attention(message) {
      await Handoff.updateOne(guard, { $set: { completion: { status: 'attention', message } } })
      return false
    }
    if (!same(service.patientId, link.patientId) || service.type !== 'medical_assist'
      || service.content?.serviceDomain !== 'annual_checkup'
      || ['cancelled', 'needs_attention'].includes(service.supervisionStatus)) return attention('服务完成凭据不完整，请核对原服务')
    const planner = await FollowUp.findById(link.plannerTaskId).lean()
    const key = /^annual_checkup:\d{4}-\d{2}-\d{2}:prepare:healthPlanner$/.test(planner?.sourceScheduleKey || '')
      ? planner.sourceScheduleKey.replace(/:prepare:healthPlanner$/, '') : ''
    if (!key || !same(planner.patientId, link.patientId) || !same(planner.sourceAnnualPlanId, link.annualPlanId)
      || planner.sourceType !== 'annual_service') return attention('准备任务年度或冻结排期不匹配')
    const ids = (service.content.followUpPlans?.length ? service.content.followUpPlans.map(x => x.id || x._id) : [service.content.followUpPlanId]).filter(Boolean)
    const schemes = await FollowUpPlan.find({ _id: { $in: ids } }).lean()
    const finalSchemes = schemes.filter(x => x.workflowStageKey === 'final_acceptance' && (x.closesService || x.workflowTaskRole === 'supervisor'))
    const reviewSchemes = schemes.filter(x => x.workflowStageKey === 'result_review' && x.executorRole === 'familyDoctor')
    if (finalSchemes.length !== 1 || reviewSchemes.length !== 1) return attention('原服务验收或顾问评估节点不唯一')
    const tasks = await FollowUp.find({ patientId: link.patientId, sourceHealthPlanId: service._id, sourceType: 'health_plan' }).lean()
    const stageTasks = scheme => tasks.filter(x => same(x.followUpSchemeId, scheme._id)
      && x.workflowKey === String(scheme._id) && x.taskRole === (scheme.workflowTaskRole || 'executor'))
    const finals = stageTasks(finalSchemes[0]), reviews = stageTasks(reviewSchemes[0])
    if (finals.length !== 1 || reviews.length !== 1 || finals[0].status !== 'completed' || reviews[0].status !== 'completed'
      || !same(finals[0].dependsOnTaskId, reviews[0]._id)
      || !String(finals[0].executedContent || '').trim() || !String(reviews[0].executedContent || '').trim()) {
      if (service.status === 'active' && !finals.some(x => x.status === 'completed')) return false
      return attention('请确认原顾问结果评估和最终验收均已完成并留有结论')
    }
    let order = null, closeOrder = false
    if (service.sourceOrderId) {
      order = await Order.findById(service.sourceOrderId).lean()
      if (!order || !same(order.user, link.patientId) || order.orderType !== 'service'
        || order.status === 'cancelled'
        || ['closed', 'refund_pending', 'refunded'].includes(order.tradeStatus)
        || ['requested', 'processing', 'partially_refunded', 'refunded'].includes(order.refundStatus) || order.paymentStatus === 'refunded') {
        return attention('订单完成或本次核销凭据尚未确认；多次服务需核对单次核销，不自动结束整单')
      }
      if (Number(order.totalUnits || 1) > 1) {
        if (!require('./checkupRedemptionSource').hasExactRedemption(order, service, link, finals[0])) return attention('请在原订单核销入口完成本次服务核销；必须明确关联本服务和验收，不自动结束整单')
      } else {
      closeOrder = order.status !== 'completed'
      if (closeOrder) {
        if (Number(order.usedUnits || 0) !== 0 || order.redemptions?.length
          || !await Order.findOne({ _id: order._id, user: link.patientId, orderType: 'service',
            ...require('./orderWorkItem').activeOrderWorkItemQuery() }).lean()) return attention('单次订单状态或核销记录有冲突，不自动关闭')
      } else if (order.fulfillmentStatus !== 'completed' || Number(order.usedUnits) !== 1) return attention('已完成订单的履约或核销凭据需核对')
      }
    } else if (service.initiationSource !== 'staff' || !service.initiatedByStaff) return attention('缺少有效服务发起凭据')
    // Final task completion is the durable intent. Resume only missing writes; never replay task execution.
    const now = new Date()
    if (service.status === 'active') {
      const result = await HealthPlan.updateOne({ _id: service._id, patientId: link.patientId, updatedAt: service.updatedAt,
        status: 'active', sourceOrderId: service.sourceOrderId || null,
        supervisionStatus: service.supervisionStatus || null }, { $set: {
        status: 'completed', 'content.workflowCompletedAt': now,
        'content.workflowCompletedBy': finals[0].assignedTo || finals[0].staffId,
        'content.checkupClosureEvidence': { handoffId: link._id, finalTaskId: finals[0]._id, reviewTaskId: reviews[0]._id },
      } })
      if (result.modifiedCount !== 1) return attention('服务状态已变化，关闭未执行，请刷新核对')
    } else if (!service.content.workflowCompletedAt) return attention('服务完成凭据不完整，请核对原服务')
    if (closeOrder) {
      const result = await Order.updateOne({ _id: order._id, user: link.patientId, updatedAt: order.updatedAt,
        totalUnits: 1, usedUnits: order.usedUnits || 0, 'redemptions.0': { $exists: false },
        ...require('./orderWorkItem').activeOrderWorkItemQuery() }, { $set: {
        status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt: now, usedUnits: 1,
      } })
      if (result.modifiedCount !== 1) return attention('订单状态已变化；服务完成已保留，订单和随访等待核对')
    }
    const filter = { patientId: link.patientId, sourceAnnualPlanId: link.annualPlanId, sourceType: 'scheduled', sourceScheduleKey: key, taskRole: { $in: [null, ''] } }
    const managers = await FollowUp.find(filter).lean()
    if (managers.length !== 1) return attention('对应年度健管随访缺失或重复，请核对；不会自动另建任务')
    let task = managers[0]
    const patient = await User.findById(link.patientId).lean()
    if (!same(task.assignedTo, patient?.assignedHealthManager) || task.aiStatus === 'pending' || task.serviceTracking) return attention('健管归属、审核状态或其他服务关联需核对')
    const proof = task.checkupPreparationCompletion
    if (task.status !== 'completed' && requiresOutcomeReview(task)) {
      if (!reviews[0].checkupOutcomeDecision || !closeReviewedOriginal) return attention('服务履约已完成；原健管计划仍待报告审核与健康顾问结果处置，不因核销自动关闭')
      try { task = await closeReviewedOriginal(task, reviews[0]) }
      catch (error) { return attention(`合并审核结案待核对：${error.message}`) }
      if (task?.status !== 'completed') return attention('原计划结果处置尚未完成')
    }
    if (proof && (!same(proof.handoffId, link._id) || !same(proof.servicePlanId, service._id))) return attention('随访已有其他完成凭据，请核对')
    if (task.status !== 'completed') {
      if (!['planned', 'in_progress', 'missed'].includes(task.status)) return attention('随访已取消或处于不可自动完成状态，保留人工处理结果')
      const result = await FollowUp.updateOne({ ...filter, _id: task._id, updatedAt: task.updatedAt,
        status: task.status, assignedTo: task.assignedTo, aiStatus: task.aiStatus || null,
        serviceTracking: null, checkupPreparationCompletion: null }, { $set: {
        status: 'completed', completedAt: new Date(), completedBy: 'staff', isBlocked: false,
        checkupPreparationCompletion: { handoffId: link._id, servicePlanId: service._id,
          finalTaskId: finals[0]._id, reviewTaskId: reviews[0]._id, completedAt: new Date() },
      } })
      if (result.modifiedCount !== 1) return attention('随访发生变化，系统将在下次扫描重新核对')
    }
    // Retry after lost acknowledgement only closes the handoff; never rewrites a completed task.
    await Handoff.updateOne(guard, { $set: { completion: { status: 'completed', managerTaskId: task._id,
      finalTaskId: finals[0]._id, servicePlanId: service._id, completedAt: new Date(),
      preservedExistingCompletion: task.status === 'completed' && !proof,
      message: '原服务已完成，年度健管随访已闭环（已有人工完成记录保持不变）' } } })
    return true
  }
  async function forService(servicePlanId) {
    const link = await Handoff.findOne({ servicePlanId, status: 'active' }).lean()
    return link ? reconcile(link) : false
  }
  async function forOriginal(task) {
    // Only the exact frozen annual slot can select a handoff. Never use the
    // customer's latest service or touch another year's preparation.
    if (task?.status !== 'completed' || !task.outcomeReview || task.sourceType !== 'scheduled'
      || !task.sourceAnnualPlanId || !/^annual_checkup:\d{4}-\d{2}-\d{2}$/.test(task.sourceScheduleKey || '')) return false
    const planners = await FollowUp.find({ patientId: task.patientId, sourceAnnualPlanId: task.sourceAnnualPlanId,
      sourceType: 'annual_service', sourceScheduleKey: `${task.sourceScheduleKey}:prepare:healthPlanner` }).lean()
    if (planners.length !== 1) return false
    const links = await Handoff.find({ patientId: task.patientId, annualPlanId: task.sourceAnnualPlanId,
      plannerTaskId: planners[0]._id, status: 'active' }).lean()
    if (links.length !== 1) return false
    return reconcile(links[0])
  }
  async function scan() {
    for await (const link of Handoff.find({ status: 'active', 'completion.status': { $ne: 'completed' } }).lean().cursor()) {
      try { await reconcile(link) } catch (error) { console.error('[checkup-preparation-completion]', String(link._id), error.message) }
    }
  }
  return { reconcile, forService, forOriginal, scan }
}
function runtime() {
  return createPreparationCompletion({ Handoff: require('../models/CheckupPreparationHandoff'),
    HealthPlan: require('../models/HealthPlan'), FollowUp: require('../models/FollowUp'),
    FollowUpPlan: require('../models/FollowUpPlan'), User: require('../models/User'), Order: require('../models/Order'),
    closeReviewedOriginal: (task, review) => require('./checkupMergedOutcome').runtime().close(task, review) })
}
module.exports = { createPreparationCompletion, runtime }
