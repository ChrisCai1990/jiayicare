function isShippingOrder(order = {}) {
  // Keep this aligned with the planner's customer-delivery conversation.
  // “营养改变生活” is configured as nutrition_intervention, but it is still
  // a warehouse-delivered product instead of an appointment workflow.
  const name = String(order.serviceName || '').trim();
  // 检测服务本身不在发货页展示；但精准基因检测需向客户寄送采样耗材，
  // 仅其耗材交接进入健管专员的发货队列。
  if (name === '营养改变生活' || /维生素|营养素|益生菌|鱼油|蛋白粉|辅酶|代餐|精准基因检测/.test(name)) return true;
  const key = order.serviceWorkflowSnapshot?.key;
  return key === 'supplement_supply'
    || (key === 'nutrition_intervention' && order.fulfillmentType === 'delivery_and_service')
    || (!key && order.fulfillmentType === 'delivery_and_service' && /营养补充|营养代餐|代餐|营养素/.test(name));
}
function hasShippingHandoff(order = {}) {
  return isShippingOrder(order)
    && order.status === 'scheduled'
    && !!order.supervisorId
    && (order.currentStage === 'awaiting_shipment' || /^已确认服务任务[:：]/m.test(String(order.note || '')));
}
function isWorkbenchShippingOrder(order = {}) {
  return isShippingOrder(order)
    && order.status !== 'cancelled'
    && order.fulfillmentStatus !== 'cancelled'
    && !['closed', 'refunded'].includes(order.tradeStatus)
    && order.paymentStatus !== 'refunded'
    && order.refundStatus !== 'refunded';
}
function shippingProgress(order = {}) {
  if (!hasShippingHandoff(order)) return '';
  return order.fulfillmentStatus === 'shipped' ? '健管专员已发货' : '健康规划师已确认，待健管专员发货';
}
module.exports = { isShippingOrder, isWorkbenchShippingOrder, hasShippingHandoff, shippingProgress };
