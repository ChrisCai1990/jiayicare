const Message = require('../models/Message');
const FollowUp = require('../models/FollowUp');

function customerOrderNote(note = '') {
  return String(note).split('；').filter(part => !/^(健康基金抵扣|优惠券抵扣|支付方式：)/.test(part)).join('；').trim();
}

async function ensureOrderPlannerPrompt(order) {
  if (!order?._id || !order.user || order.orderType === 'package') return null;
  const conversationId = `${order.user}_planner`;
  const existing = await Message.findOne({ conversationId, 'action.type': 'order_planner_confirmation', 'action.orderId': String(order._id) });
  if (existing) return existing;

  const related = await FollowUp.find({
    patientId: order.user,
    status: { $in: ['planned', 'in_progress', 'missed'] },
    sourceOrderId: { $ne: order._id },
  }).sort({ date: 1 }).limit(3).select('theme date content').lean();
  const note = customerOrderNote(order.note);
  const scheduled = order.scheduledAt ? new Date(order.scheduledAt).toLocaleDateString('zh-CN') : '';
  const relatedText = related.length
    ? `我也看到了您现有的安排：${related.map(item => `${item.theme || '随访事项'}${item.date ? `（${new Date(item.date).toLocaleDateString('zh-CN')}）` : ''}`).join('、')}。`
    : '';
  const known = [scheduled && `订单时间为${scheduled}`, note && `备注为“${note}”`].filter(Boolean).join('，');
  const question = scheduled
    ? '请确认这个时间是否仍合适，并告诉我本次需要确认的具体服务内容和最希望解决的需求。'
    : '请告诉我您希望的服务时间、本次需要确认的具体服务内容，以及最希望解决的需求；已有信息不用重复。';
  const content = `已收到您的“${order.serviceName}”订单。${known ? `${known}。` : ''}${relatedText}${question}`;
  if (!order.aiIntake?.status || order.aiIntake.status === 'not_started') {
    const now = new Date();
    await order.constructor.updateOne({ _id: order._id, 'aiIntake.status': { $in: ['not_started', null] } }, { $set: {
      'aiIntake.status': 'in_progress', 'aiIntake.startedAt': now, 'aiIntake.updatedAt': now,
      'aiIntake.missingFields': ['serviceTime', 'serviceContent', 'customerNeed'],
    } });
  }
  return Message.create({
    user: order.user, type: 'planner', sender: 'AI健康规划师', title: '订单服务确认',
    content, conversationId, isAI: true, aiGenerated: false, unread: true,
    action: { type: 'order_planner_confirmation', orderId: String(order._id) },
  });
}

function normalizeIntakeResult(input = {}, previous = {}) {
  const value = key => String(input[key] || previous[key] || '').trim().slice(0, 1000);
  const result = { serviceTime: value('serviceTime'), serviceContent: value('serviceContent'), customerNeed: value('customerNeed'), riskFlags: Array.isArray(input.riskFlags) ? input.riskFlags.map(String).filter(Boolean).slice(0, 10) : (previous.riskFlags || []) };
  result.missingFields = ['serviceTime', 'serviceContent', 'customerNeed'].filter(key => !result[key]);
  result.status = result.riskFlags.length ? 'needs_attention' : result.missingFields.length ? 'in_progress' : 'ready_for_review';
  result.summary = [result.serviceTime && `服务时间：${result.serviceTime}`, result.serviceContent && `服务内容：${result.serviceContent}`, result.customerNeed && `客户需求：${result.customerNeed}`].filter(Boolean).join('\n');
  return result;
}

module.exports = { customerOrderNote, ensureOrderPlannerPrompt, normalizeIntakeResult };
