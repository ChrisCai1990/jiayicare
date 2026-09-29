function isShippingOrder(order = {}) {
  // Keep this aligned with the planner's customer-delivery conversation.
  // “营养改变生活” is configured as nutrition_intervention, but it is still
  // a warehouse-delivered product instead of an appointment workflow.
  if (String(order.serviceName || '').trim() === '营养改变生活') return true;
  const key = order.serviceWorkflowSnapshot?.key;
  return key === 'supplement_supply'
    || (key === 'nutrition_intervention' && order.fulfillmentType === 'delivery_and_service')
    || (!key && order.fulfillmentType === 'delivery_and_service' && /营养补充|营养代餐|代餐|营养素/.test(String(order.serviceName || '')));
}
function shippingProgress(order = {}) {
  if (!isShippingOrder(order) || order.status !== 'scheduled' || !order.handledBy) return '';
  return order.fulfillmentStatus === 'shipped' ? '健管专员已发货' : '健康规划师已确认，待健管专员发货';
}
module.exports = { isShippingOrder, shippingProgress };
