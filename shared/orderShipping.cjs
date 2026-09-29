function isShippingOrder(order = {}) {
  const key = order.serviceWorkflowSnapshot?.key;
  if (key && key !== 'fulfillment_only') return false;
  return order.fulfillmentType === 'delivery_and_service' || order.serviceName === '营养改变生活';
}
function shippingProgress(order = {}) {
  if (!isShippingOrder(order) || order.status !== 'scheduled' || !order.handledBy) return '';
  return order.fulfillmentStatus === 'shipped' ? '健管专员已发货' : '健康规划师已确认，待健管专员发货';
}
module.exports = { isShippingOrder, shippingProgress };
