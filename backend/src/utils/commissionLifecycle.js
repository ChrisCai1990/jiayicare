const INVALID_ORDER_FILTER = { $or: [
  { status: 'cancelled' }, { paymentStatus: 'refunded' },
  { refundStatus: 'refunded' }, { tradeStatus: { $in: ['closed', 'refunded'] } },
] };

function cancellationReason(order) {
  if (!order) return '';
  if (order.paymentStatus === 'refunded' || order.refundStatus === 'refunded' || order.tradeStatus === 'refunded') return '订单已全额退款，佣金自动取消';
  if (order.status === 'cancelled' || order.tradeStatus === 'closed') return '订单已取消，佣金自动取消';
  return '';
}

function commissionBlockReason(order, commission) {
  if (!order) return '关联订单不存在，不能结算佣金';
  if (cancellationReason(order)) return cancellationReason(order);
  if (order.paymentStatus !== 'paid') return '订单尚未有效支付，不能结算佣金';
  if (['requested', 'processing'].includes(order.refundStatus) || order.tradeStatus === 'refund_pending') return '订单退款处理中，不能审核或打款';
  if (order.refundStatus === 'partially_refunded' && commission && !(commission.refundedAmount > 0)) return '部分退款金额尚未核对，不能结算佣金';
  return commission ? require('./commissionEligibility').eligibility(order, commission).reason : '';
}

async function cancelOrderCommissions(order) {
  const reason = cancellationReason(order);
  if (!reason || !order?._id) return;
  const Commission = require('../models/Commission');
  await Commission.updateMany(
    { orderId: order._id, status: { $in: ['estimated', 'pending', 'confirmed'] } },
    { $set: { status: 'cancelled', cancellationReason: reason, cancelledAt: new Date() } },
  );
  // 保留实际打款事实，不把已支付款项伪装成已追回。
  await Commission.updateMany(
    { orderId: order._id, status: 'paid' },
    { $set: { reversalRequired: true, cancellationReason: reason } },
  );
}

async function reconcileCancelledCommissions() {
  const Order = require('../models/Order');
  const Commission = require('../models/Commission');
  const orderIds = await Commission.distinct('orderId', { $or: [{ status: { $in: ['estimated', 'pending', 'confirmed'] } }, { status: 'paid', reversalRequired: { $ne: true } }] });
  const orders = await Order.find({ $and: [INVALID_ORDER_FILTER, { _id: { $in: orderIds } }] }).select('_id status paymentStatus refundStatus tradeStatus');
  for (const order of orders) await cancelOrderCommissions(order);
}

module.exports = { INVALID_ORDER_FILTER, cancellationReason, commissionBlockReason, cancelOrderCommissions, reconcileCancelledCommissions };
