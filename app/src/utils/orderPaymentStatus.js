const labels = {
  created: '订单已创建', awaiting_payment: '待支付', paid: '已支付·待安排',
  fulfilling: '服务中', completed: '已完成', closed: '已关闭',
  refund_pending: '退款处理中', partially_refunded: '部分退款', refunded: '已退款',
};
function tradeLabel(order) { return labels[order.tradeStatus] || ''; }
function canCancelOrder(order) {
  if (order.tradeStatus) return order.status === 'pending' && ['created', 'awaiting_payment'].includes(order.tradeStatus) && !['paid', 'refunded'].includes(order.paymentStatus);
  return !['paid', 'refunded'].includes(order.paymentStatus) && ['pending', 'scheduled'].includes(order.status);
}
module.exports = { tradeLabel, canCancelOrder };
