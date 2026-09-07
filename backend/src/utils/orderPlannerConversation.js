const Message = require('../models/Message');
const { isCustomerConfirmedServiceOrder } = require('./orderServiceConfirmation');

function customerOrderNote(note = '') {
  return String(note).split('；').filter(part => !/^(健康基金抵扣|优惠券抵扣|支付方式：)/.test(part)).join('；').trim();
}

function extractExplicitServiceTime(note = '') {
  return String(note).match(/(?:今天|明天|后天|本周|下周|这周|一周内|两周内|本月|下月|月底前|\d{1,2}月\d{1,2}日|周[一二三四五六日天])/u)?.[0] || '';
}

async function ensureOrderPlannerPrompt(order) {
  if (!order?._id || !order.user) return null;
  const confirmed = isCustomerConfirmedServiceOrder(order);
  const pending = require('./orderServiceConfirmation').needsCustomerServiceConfirmation(order);
  if (!confirmed && !pending) return null;
  const conversationId = `${order.user}_planner`;
  const note = customerOrderNote(order.note);
  const scheduled = order.desiredServiceDate ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai' }).format(new Date(order.desiredServiceDate)) : '';
  const explicitTime = extractExplicitServiceTime(note);
  const content = confirmed
    ? `已确认您的“${order.serviceName}”订单：服务时间为${scheduled}，服务内容为“${order.serviceRequirements}”${note ? `，补充备注为“${note}”` : ''}。信息已同步给嘉医管家，人工接手后可直接查看。`
    : `已收到您的“${order.serviceName}”订单。${note ? `我从备注中了解到：“${note}”。` : ''}${explicitTime ? `已识别期望时间为“${explicitTime}”，` : ''}为便于安排，请确认具体服务内容${explicitTime ? '；如方便，也请补充更具体的日期' : '和期望时间'}。相对时间不会被自动改成未经您确认的具体日期。`;
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

function normalizeIntakeResult(input = {}, previous = {}) {
  const value = key => String(input[key] || previous[key] || '').trim().slice(0, 1000);
  const result = { serviceTime: value('serviceTime'), serviceContent: value('serviceContent'), customerNeed: value('customerNeed'), riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String).filter(Boolean).slice(0, 10) : (previous.riskFlags || []) };
  result.missingFields = ['serviceTime', 'serviceContent', 'customerNeed'].filter(key => !result[key]);
  result.status = result.riskFlags.length ? 'needs_attention' : result.missingFields.length ? 'in_progress' : 'ready_for_review';
  result.summary = [result.serviceTime && `服务时间：${result.serviceTime}`, result.serviceContent && `服务内容：${result.serviceContent}`, result.customerNeed && `客户需求：${result.customerNeed}`].filter(Boolean).join('\n');
  return result;
}

module.exports = { customerOrderNote, extractExplicitServiceTime, ensureOrderPlannerPrompt, normalizeIntakeResult };
