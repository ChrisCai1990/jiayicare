const ACTIVE_ORDER_TRADE_STATUSES = ['paid', 'fulfilling', 'partially_refunded'];
const ACTIVE_ORDER_REFUND_STATUSES = ['', 'none', 'failed', 'partially_refunded'];

async function reconcileInactiveOrderWorkItems(patientId = null) {
  const Order = require('../models/Order');
  const FollowUp = require('../models/FollowUp');
  const followUpFilter = {
    sourceType: 'order',
    sourceOrderId: { $ne: null },
    status: { $in: ['planned', 'in_progress', 'missed'] },
  };
  if (patientId) followUpFilter.patientId = patientId;
  const linkedOrderIds = await FollowUp.find(followUpFilter).distinct('sourceOrderId');
  let modifiedCount = 0;
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
  const activeOrders = await Order.find(orderFilter).select('_id user serviceName note').lean();
  if (activeOrders.length) {
    const existingIds = await FollowUp.find({ sourceType: 'order', sourceOrderId: { $in: activeOrders.map(order => order._id) } }).distinct('sourceOrderId');
    const existingSet = new Set(existingIds.map(String));
    const { resolveHealthPlanner } = require('./healthPlannerAssignment');
    for (const order of activeOrders) {
      if (existingSet.has(String(order._id))) continue;
      const plannerId = await resolveHealthPlanner(order.user);
      if (!plannerId) continue;
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
    paymentStatus: 'paid',
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
