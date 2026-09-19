const Message = require('../models/Message');
const Order = require('../models/Order');
const { isCustomerConfirmedServiceOrder } = require('./orderServiceConfirmation');

function customerOrderNote(note = '') {
  return String(note).split('；').filter(part => !/^(健康基金抵扣|优惠券抵扣|支付方式：)/.test(part)).join('；').trim();
}

function extractExplicitServiceTime(note = '') {
  return String(note).match(/(?:今天|明天|后天|本周|下周|这周|一周内|两周内|本月|下月|月底前|\d{1,2}月\d{1,2}日|周[一二三四五六日天])/u)?.[0] || '';
}

function isPaidActiveOrder(order = {}) {
  return order.paymentStatus === 'paid'
    && ['paid', 'fulfilling', 'completed'].includes(order.tradeStatus)
    && !['requested', 'processing', 'partially_refunded', 'refunded'].includes(order.refundStatus || 'none');
}

function isMedicationProxyOrder(order = {}) {
  return /代配药|代取药/.test([order.serviceName, order.specificationLabel, order.note, order.serviceRequirements].filter(Boolean).join(' '));
}

function isNutritionDeliveryOrder(order = {}) {
  const workflow = order.serviceWorkflowSnapshot?.key || '';
  // Legacy configuration still marks this confirmed physical meal-replacement
  // product as offline_service. This exception changes copy, not fulfillment.
  if (String(order.serviceName || '').trim() === '营养改变生活') return true;
  if (workflow) return workflow === 'supplement_supply'
    || (workflow === 'nutrition_intervention' && order.fulfillmentType === 'delivery_and_service');
  // Compatibility for old orders without a workflow snapshot. Do not infer
  // warehouse shipping from arbitrary customer notes or all nutrition services.
  return order.fulfillmentType === 'delivery_and_service'
    && /营养补充|营养代餐|代餐|营养素/.test(String(order.serviceName || ''));
}

function buildOrderPlannerPrompt(order = {}) {
  if (!isPaidActiveOrder(order)) return '';
  if (isMedicationProxyOrder(order)) {
    const note = customerOrderNote(order.note);
    return `已收到您的“${order.serviceName}”订单。为了安全、准确地安排代配药，我先协助您核对本次信息。请按现有处方或医嘱告诉我：药品通用名、商品名/品牌、规格、单次服用剂量、每日次数、本次需要的数量、配药机构（医院/线上平台/线下药房）、支付方式和期望送达日期。${note ? `订单备注：“${note}”。` : ''}不清楚的项目可以直接说“不清楚”，我会只继续询问缺失内容；最终由健康规划师人工确认，AI不会替您换药、改剂量或修改医嘱。`;
  }
  if (isNutritionDeliveryOrder(order)) {
    return `已收到您的“${order.serviceName}”订单，支付已确认。本订单涉及的营养产品由仓库安排发货。如尚未确认收货信息，请补充收货人、联系电话和详细收货地址；已提供的信息无需重复填写。具体发货安排以工作人员确认为准，如有配送方面的需求，可以直接在这里留言。`;
  }
  const confirmed = isCustomerConfirmedServiceOrder(order);
  const pending = require('./orderServiceConfirmation').needsCustomerServiceConfirmation(order);
  const note = customerOrderNote(order.note);
  const scheduled = order.desiredServiceDate ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' }).format(new Date(order.desiredServiceDate)) : '';
  const explicitTime = extractExplicitServiceTime(note);
  if (confirmed) {
    return `已确认您的“${order.serviceName}”订单：服务时间为${scheduled}，服务内容为“${order.serviceRequirements}”${note ? `，补充备注为“${note}”` : ''}。信息已同步给嘉医管家，人工接手后可直接查看。`;
  }
  if (pending) {
    return `已收到您的“${order.serviceName}”订单。${note ? `我从备注中了解到：“${note}”。` : ''}${explicitTime ? `已识别期望时间为“${explicitTime}”，` : ''}为便于安排，请确认具体服务内容${explicitTime ? '；如方便，也请补充更具体的日期' : '和期望时间'}。相对时间不会被自动改成未经您确认的具体日期。`;
  }
  return `已收到您的“${order.serviceName}”订单，支付已确认。健康规划师会跟进后续服务或交付安排；如有需要补充的信息，可直接在这里留言。`;
}

async function ensureOrderPlannerPrompt(order) {
  if (!order?._id || !order.user) return null;
  const content = buildOrderPlannerPrompt(order);
  if (!content) return null;
  const conversationId = `${order.user}_planner`;
  const existing = await Message.findOne({
    conversationId,
    $or: [
      { 'action.type': 'order_planner_confirmation', 'action.orderId': String(order._id) },
      { type: 'planner', isAI: true, title: '订单服务确认', content },
    ],
  });
  if (existing) return existing;
  try {
    return await Message.create({
      user: order.user, type: 'planner', sender: 'AI健康规划师', title: '订单服务确认',
      content, conversationId, isAI: true, aiGenerated: false, unread: true,
      dedupeKey: `order-planner-confirmation:${order._id}`,
      action: { type: 'order_planner_confirmation', orderId: String(order._id) },
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Message.findOne({ dedupeKey: `order-planner-confirmation:${order._id}` });
  }
}

async function latestOpenOrderConversationAction(userId, conversationId) {
  // 客户回复应跟随最近一次实际发生的订单沟通。只找系统确认提示会在多订单
  // 并行时把客户对规划师方案的回复错误标到另一笔订单，随后被“仅看本单”隐藏。
  const prompt = await Message.findOne({
    user: userId,
    conversationId,
    'action.type': { $in: ['order_planner_confirmation', 'order_conversation'] },
    'action.orderId': { $exists: true, $ne: '' },
  }).sort({ createdAt: -1 }).select('action').lean();
  const orderId = prompt?.action?.orderId;
  if (!orderId) return undefined;
  const orderExists = await Order.exists({
    _id: orderId,
    user: userId,
    status: { $in: ['pending', 'scheduled'] },
    tradeStatus: { $in: ['paid', 'fulfilling', 'partially_refunded'] },
  });
  return orderExists ? { type: 'order_conversation', orderId: String(orderId) } : undefined;
}

function normalizeIntakeResult(input = {}, previous = {}) {
  const value = key => String(input[key] || previous[key] || '').trim().slice(0, 1000);
  const result = { serviceTime: value('serviceTime'), serviceContent: value('serviceContent'), customerNeed: value('customerNeed'), riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String).filter(Boolean).slice(0, 10) : (previous.riskFlags || []) };
  result.missingFields = ['serviceTime', 'serviceContent', 'customerNeed'].filter(key => !result[key]);
  result.status = result.riskFlags.length ? 'needs_attention' : result.missingFields.length ? 'in_progress' : 'ready_for_review';
  result.summary = [result.serviceTime && `服务时间：${result.serviceTime}`, result.serviceContent && `服务内容：${result.serviceContent}`, result.customerNeed && `客户需求：${result.customerNeed}`].filter(Boolean).join('\n');
  return result;
}

module.exports = { customerOrderNote, extractExplicitServiceTime, isPaidActiveOrder, isMedicationProxyOrder, isNutritionDeliveryOrder, buildOrderPlannerPrompt, ensureOrderPlannerPrompt, latestOpenOrderConversationAction, normalizeIntakeResult };
