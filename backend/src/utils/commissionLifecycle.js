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

function commissionBlockReason(order) {
  if (!order) return '关联订单不存在，不能结算佣金';
  return cancellationReason(order)
    || (order.paymentStatus !== 'paid' ? '订单尚未有效支付，不能结算佣金' : '')
    || (['requested', 'processing', 'partially_refunded'].includes(order.refundStatus) || order.tradeStatus === 'refund_pending'
      ? '订单退款处理中或已部分退款，请完成退款核对后再结算佣金' : '');
}

async function cancelOrderCommissions(order) {
  const reason = cancellationReason(order);
  if (!reason || !order?._id) return;
  const Commission = require('../models/Commission');
  await Commission.updateMany(
    { orderId: order._id, status: { $in: ['pending', 'confirmed'] } },
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
  const orderIds = await Commission.distinct('orderId', { $or: [{ status: { $in: ['pending', 'confirmed'] } }, { status: 'paid', reversalRequired: { $ne: true } }] });
  const orders = await Order.find({ $and: [INVALID_ORDER_FILTER, { _id: { $in: orderIds } }] }).select('_id status paymentStatus refundStatus tradeStatus');
  for (const order of orders) await cancelOrderCommissions(order);
}

module.exports = { INVALID_ORDER_FILTER, cancellationReason, commissionBlockReason, cancelOrderCommissions, reconcileCancelledCommissions };
