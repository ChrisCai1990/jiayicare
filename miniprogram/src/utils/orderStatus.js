export const ORDER_TABS = [
  { key: 'all', label: '全部' },
  { key: 'payment', label: '待支付' },
  { key: 'service', label: '待服务' },
  { key: 'progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'afterSale', label: '退款/售后' },
];

export function getOrderCategory(order = {}) {
  if (['refund_pending', 'partially_refunded', 'refunded'].includes(order.tradeStatus)
    || ['requested', 'processing', 'refunded', 'rejected'].includes(order.refundStatus)) return 'afterSale';
  if (order.tradeStatus === 'awaiting_payment') return 'payment';
  if (order.tradeStatus === 'completed' || order.status === 'completed') return 'completed';
  if (order.tradeStatus === 'fulfilling' || ['booked', 'shipped', 'in_service'].includes(order.fulfillmentId?.status)) return 'progress';
  if (['paid', 'created'].includes(order.tradeStatus)
    || ['confirmed', 'pending'].includes(order.status)
    || ['pending_assignment', 'awaiting_booking', 'awaiting_shipment'].includes(order.fulfillmentId?.status)) return 'service';
  return 'all';
}

export function getOrderCounts(orders = []) {
  return orders.reduce((counts, order) => {
    const category = getOrderCategory(order);
    counts.all += 1;
    if (category !== 'all') counts[category] += 1;
    return counts;
  }, { all: 0, payment: 0, service: 0, progress: 0, completed: 0, afterSale: 0 });
}

export function formatOrderTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
