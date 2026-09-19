const same = (a, b) => Boolean(a && b && String(a) === String(b))
const fail = message => Object.assign(new Error(message), { statusCode: 409 })

// Reuse the existing redemption action. Only one unambiguous, accepted service may be inferred.
async function resolveCheckupRedemption(order, actor, models) {
  const { HealthPlan, Handoff, FollowUp, FollowUpPlan, User } = models
  const services = await HealthPlan.find({ sourceOrderId: order._id, patientId: order.user, type: 'medical_assist',
    'content.serviceDomain': 'annual_checkup' }).lean()
  const links = await Handoff.find({ servicePlanId: { $in: services.map(x => x._id) }, patientId: order.user }).lean()
  if (!links.length) return null // unrelated original workflows remain unchanged
  if (order.serviceItemsSnapshot?.length > 1) throw fail('多子项目体检订单需先明确服务与子项目对应关系，不能推断核销')
  const patient = await User.findById(order.user).lean()
  if (actor.role !== 'superadmin' && (actor.role !== 'healthPlanner' || !same(patient?.assignedHealthPlanner, actor._id))) {
    throw Object.assign(fail('本体检服务仅所属健康规划师可核销'), { statusCode: 403 })
  }
  if (['closed', 'refund_pending', 'refunded'].includes(order.tradeStatus)
    || ['requested', 'processing', 'partially_refunded', 'refunded'].includes(order.refundStatus)
    || !(order.paymentStatus === 'paid' || (order.initiationSource === 'staff_direct' && order.paymentStatus === 'unpaid' && order.servicePrice === 0))) throw fail('订单支付或退款状态不允许核销')
  const candidates = []
  for (const link of links) {
    if (link.status !== 'active' || (order.redemptions || []).some(x => same(x.servicePlanId, link.servicePlanId))) continue
    const service = services.find(x => same(x._id, link.servicePlanId))
    if (!service || !['active', 'completed'].includes(service.status) || ['cancelled', 'needs_attention'].includes(service.supervisionStatus)) continue
    const ids = (service.content.followUpPlans?.length ? service.content.followUpPlans.map(x => x.id || x._id) : [service.content.followUpPlanId]).filter(Boolean)
    const schemes = await FollowUpPlan.find({ _id: { $in: ids } }).lean()
    const finals = schemes.filter(x => x.workflowStageKey === 'final_acceptance' && (x.closesService || x.workflowTaskRole === 'supervisor'))
    const reviews = schemes.filter(x => x.workflowStageKey === 'result_review' && x.executorRole === 'familyDoctor')
    if (finals.length !== 1 || reviews.length !== 1) continue
    const tasks = await FollowUp.find({ sourceHealthPlanId: service._id, patientId: order.user, sourceType: 'health_plan', status: 'completed' }).lean()
    const matches = scheme => tasks.filter(x => same(x.followUpSchemeId, scheme._id) && x.workflowKey === String(scheme._id) && x.taskRole === (scheme.workflowTaskRole || 'executor') && String(x.executedContent || '').trim())
    const final = matches(finals[0]), review = matches(reviews[0])
    if (final.length !== 1 || review.length !== 1 || !same(final[0].dependsOnTaskId, review[0]._id)) continue
    candidates.push({ servicePlanId: service._id, handoffId: link._id, finalTaskId: final[0]._id })
  }
  if (candidates.length !== 1) throw fail(candidates.length ? '存在多条已验收服务，请先核对本次核销对应关系，系统不会猜测' : '没有唯一未核销且已完成验收的体检服务，请勿重复核销')
  return candidates[0]
}

function hasExactRedemption(order, service, link, final) {
  const rows = (order.redemptions || []).filter(x => same(x.servicePlanId, service._id))
  if (rows.length !== 1) return false
  const row = rows[0], sequence = Number(row.sequence), total = Number(order.totalUnits), used = Number(order.usedUnits)
  return same(row.handoffId, link._id) && same(row.finalTaskId, final._id) && Boolean(row.redeemedBy)
    && (order.paymentStatus === 'paid' || (order.initiationSource === 'staff_direct' && order.paymentStatus === 'unpaid' && order.servicePrice === 0))
    && Boolean(row.redeemedAt) && Number.isFinite(new Date(row.redeemedAt).getTime())
    && Number.isInteger(sequence) && Number.isInteger(used) && Number.isInteger(total) && sequence >= 1 && sequence <= used && used <= total
    && (order.redemptions || []).filter(x => Number(x.sequence) === sequence).length === 1
    && (used < total ? order.status === 'scheduled' : order.status === 'completed')
}
async function saveCheckupRedemption(Order, order, source, original) {
  return Order.updateOne({ _id: order._id, updatedAt: original.updatedAt, status: original.status,
    usedUnits: original.usedUnits, 'redemptions.servicePlanId': { $ne: source.servicePlanId },
    paymentStatus: order.paymentStatus, refundStatus: order.refundStatus, tradeStatus: order.tradeStatus }, { $set: {
    redemptions: order.redemptions, usedUnits: order.usedUnits, status: order.status,
    serviceItemsSnapshot: order.serviceItemsSnapshot, ...(order.completedAt ? { completedAt: order.completedAt } : {}),
  } })
}
module.exports = { resolveCheckupRedemption, hasExactRedemption, saveCheckupRedemption }
