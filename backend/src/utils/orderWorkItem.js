const ACTIVE_ORDER_TRADE_STATUSES = ['paid', 'fulfilling', 'partially_refunded'];
const ACTIVE_ORDER_REFUND_STATUSES = ['', 'none', 'failed', 'partially_refunded'];

async function reconcileInactiveOrderWorkItems(patientId = null) {
  const Order = require('../models/Order');
  const FollowUp = require('../models/FollowUp');
  // 取消或退款的一次性服务以订单作为审计记录即可；其内部岗位任务不属于服务历史，
  // 直接从客户“服务执行任务”删除，避免长期留下“已取消综合服务”占位。
  const cancelledOrderFilter = {
    ...(patientId ? { user: patientId } : {}),
    $or: [
      { status: 'cancelled' },
      { tradeStatus: { $in: ['closed', 'refund_pending', 'refunded'] } },
      { refundStatus: { $in: ['requested', 'processing', 'refunded'] } },
      { paymentStatus: 'refunded' },
    ],
  };
  const cancelledOrderIds = await Order.find(cancelledOrderFilter).distinct('_id');
  const removedServiceTasks = cancelledOrderIds.length ? await FollowUp.deleteMany({
    sourceType: 'order',
    sourceOrderId: { $in: cancelledOrderIds },
    workflowKey: /^(medical_proxy|medication_proxy|checkup_appointment):/,
    ...(patientId ? { patientId } : {}),
  }) : { deletedCount: 0 };
  const followUpFilter = {
    sourceType: 'order',
    sourceOrderId: { $ne: null },
    status: { $in: ['planned', 'in_progress', 'missed'] },
    // 订单完成后生成的随访计划是新的临床跟进任务，不是未完成的订单履约工作项。
    // 不能因原订单已结束就将它取消。
    sourceScheduleKey: { $not: /^(medical_escort_followup|expert_appointment_followup):/ },
  };
  if (patientId) followUpFilter.patientId = patientId;
  const postVisitRepairFilter = {
    sourceType: 'order',
    sourceScheduleKey: /^(medical_escort_followup|expert_appointment_followup):/,
    aiStatus: 'pending',
    status: 'cancelled',
    cancelReason: '关联订单已取消、退款或结束',
    ...(patientId ? { patientId } : {}),
  };
  const repairedPlans = await FollowUp.updateMany(postVisitRepairFilter, { $set: { status: 'planned', cancelReason: '' } });
  let modifiedCount = (repairedPlans.modifiedCount || 0) + (removedServiceTasks.deletedCount || 0);
  const linkedOrderIds = await FollowUp.find(followUpFilter).distinct('sourceOrderId');
  if (linkedOrderIds.length) {
    const activeOrderIds = await Order.find({ _id: { $in: linkedOrderIds }, ...activeOrderWorkItemQuery() }).distinct('_id');
    const result = await FollowUp.updateMany(
      { ...followUpFilter, sourceOrderId: { $in: linkedOrderIds.filter(id => !activeOrderIds.some(activeId => String(activeId) === String(id))) } },
      { $set: { status: 'cancelled', cancelReason: '关联订单已取消、退款或结束' } },
    );
    modifiedCount += result.modifiedCount || 0;
  }

  // 历史订单可能在付款时尚未分配健康顾问，因而完全没有生成工作项。
  // 订单仍有效时补建一次；已有完成/取消记录也算有历史，不自动重开，避免重复服务。
  const orderFilter = { ...activeOrderWorkItemQuery() };
  if (patientId) orderFilter.user = patientId;
  const activeOrders = await Order.find(orderFilter).select('_id user serviceName specificationLabel serviceRequirements note supervisorId').lean();
  if (activeOrders.length) {
    const existingIds = await FollowUp.find({ sourceType: 'order', sourceOrderId: { $in: activeOrders.map(order => order._id) } }).distinct('sourceOrderId');
    const existingSet = new Set(existingIds.map(String));
  const { resolveHealthPlanner } = require('./healthPlannerAssignment');
  for (const order of activeOrders) {
      const medicalReminderWorkflow = require('./medicalReminderWorkflow');
      if (medicalReminderWorkflow.isMedicalReminderOrder(order)) {
        await medicalReminderWorkflow.ensureAdvisorIntakeTask(order);
        continue;
      }
      if (existingSet.has(String(order._id))) continue;
      const plannerId = order.supervisorId || await resolveHealthPlanner(order.user);
      if (!plannerId) continue;
      if (!order.supervisorId) await Order.updateOne({ _id: order._id, supervisorId: null }, { $set: {
        supervisorId: plannerId, currentAssignee: plannerId, currentStage: 'intake', supervisionStatus: 'pending_intake',
      } });
      await FollowUp.create({
        staffId: plannerId,
        assignedTo: plannerId,
        patientId: order.user,
        type: 'other',
        status: 'planned',
        theme: `订单服务：${order.serviceName}`,
        content: order.note || '用户已完成支付，请联系确认服务安排',
        sourceType: 'order',
        sourceOrderId: order._id,
      });
      modifiedCount += 1;
    }
  }
  return modifiedCount;
}

function restoreOrderAfterRefundFailure(order) {
  order.refundStatus = 'failed';
  order.tradeStatus = order.serviceStartedAt ? 'fulfilling' : 'paid';
  return order;
}

function activeOrderWorkItemQuery() {
  return {
    $or: [{ paymentStatus: 'paid' }, { initiationSource: 'staff_direct', paymentStatus: 'unpaid', servicePrice: 0 }],
    tradeStatus: { $in: ACTIVE_ORDER_TRADE_STATUSES },
    refundStatus: { $in: [...ACTIVE_ORDER_REFUND_STATUSES, null] },
    status: { $in: ['pending', 'scheduled'] },
  };
}

module.exports = {
  ACTIVE_ORDER_TRADE_STATUSES,
  ACTIVE_ORDER_REFUND_STATUSES,
  activeOrderWorkItemQuery,
  reconcileInactiveOrderWorkItems,
  restoreOrderAfterRefundFailure,
};
