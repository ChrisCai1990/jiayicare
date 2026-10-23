const mongoose = require('mongoose');

const isSingleNutritionAssessmentOrder = order => order?.orderType === 'service'
  && /^\s*(?:单次)?营养评估(?:服务)?\s*$/.test(String(order.serviceName || ''))
  && Number(order.totalUnits || 1) === 1
  && !(order.serviceItemsSnapshot || []).length;

const isAvailableNutritionAssessmentOrder = order => isSingleNutritionAssessmentOrder(order)
  && order.paymentStatus === 'paid'
  && ['pending', 'scheduled'].includes(order.status)
  && (!order.refundStatus || order.refundStatus === 'none')
  && !['closed', 'refund_pending', 'refunded'].includes(order.tradeStatus)
  && Number(order.usedUnits || 0) === 0
  && !(order.redemptions || []).length;

const closeOrderTasks = (orderId, now = new Date()) => require('../models/FollowUp').updateMany({
  sourceType: 'order', sourceOrderId: orderId, status: { $nin: ['completed', 'cancelled'] },
}, { $set: { status: 'completed', completedAt: now, completedBy: 'staff' } });

async function settleNutritionAssessmentOrder(row, staff, Order) {
  if (!mongoose.isValidObjectId(row?.sourceOrderId)) return { status: 'not_applicable' };
  const order = await Order.findById(row.sourceOrderId);
  if (!order || String(order.user) !== String(row.patientId) || (order.tenantId && String(order.tenantId) !== String(row.tenantId)))
    throw new Error('关联订单不存在或服务对象不一致');
  if ((order.redemptions || []).some(item => String(item.nutritionAssessmentRequestId || '') === String(row._id))) {
    if (order.packageEntitlementUsage) {
      const result = await require('./packageServiceRedemption').safeReconcilePackageOrder(order);
      if (!['completed', 'unchanged'].includes(result.status)) throw new Error('套餐次数核销待核对');
    }
    await closeOrderTasks(order._id);
    return { status: 'completed', order };
  }
  if (!isAvailableNutritionAssessmentOrder(order)) throw new Error('关联订单已失效或已核销，请核对订单');
  const now = new Date();
  const updated = await Order.findOneAndUpdate({ _id: order._id, user: row.patientId, paymentStatus: 'paid',
    status: { $in: ['pending', 'scheduled'] }, refundStatus: { $in: ['', 'none', null] },
    tradeStatus: { $nin: ['closed', 'refund_pending', 'refunded'] },
    usedUnits: { $in: [0, null] }, 'redemptions.0': { $exists: false } }, {
    $set: { usedUnits: 1, status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed',
      serviceStartedAt: order.serviceStartedAt || now, serviceStartedBy: order.serviceStartedBy || staff._id,
      serviceStartEvidence: order.serviceStartEvidence || `营养评估需求单 ${row._id} 已完成`, completedAt: now },
    $push: { redemptions: { sequence: 1, redeemedAt: now, redeemedBy: staff._id,
      nutritionAssessmentRequestId: row._id, note: `营养师完成营养评估需求单 ${row._id}` } },
  }, { new: true });
  if (!updated) throw new Error('订单状态已变化，请刷新后重试核销');
  if (updated.packageEntitlementUsage) {
    const result = await require('./packageServiceRedemption').safeReconcilePackageOrder(updated);
    if (!['completed', 'unchanged'].includes(result.status)) throw new Error('订单已完成，套餐次数核销待核对');
  } else {
    try { await require('./commissionSettlement').settleOrderCommission(updated); }
    catch (error) { console.error('[nutrition-assessment] commission deferred', updated._id, error.message); }
  }
  await closeOrderTasks(updated._id, now);
  return { status: 'completed', order: updated };
}

module.exports = { isSingleNutritionAssessmentOrder, isAvailableNutritionAssessmentOrder, settleNutritionAssessmentOrder };
