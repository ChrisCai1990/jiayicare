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
  if (!linkedOrderIds.length) return 0;
  const activeOrderIds = await Order.find({ _id: { $in: linkedOrderIds }, ...activeOrderWorkItemQuery() }).distinct('_id');
  const result = await FollowUp.updateMany(
    { ...followUpFilter, sourceOrderId: { $in: linkedOrderIds.filter(id => !activeOrderIds.some(activeId => String(activeId) === String(id))) } },
    { $set: { status: 'cancelled', cancelReason: '关联订单已取消、退款或结束' } },
  );
  return result.modifiedCount || 0;
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
};
