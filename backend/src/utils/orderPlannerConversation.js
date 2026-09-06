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
    ? '请确认这个时间是否仍合适，并补充服务地点及其他要求。'
    : '您希望安排在哪一天？也请补充服务地点及其他要求，我会结合现有安排继续协助。';
  const content = `已收到您的“${order.serviceName}”订单。${known ? `${known}。` : ''}${relatedText}${question}`;
  return Message.create({
    user: order.user, type: 'planner', sender: 'AI健康规划师', title: '订单服务确认',
    content, conversationId, isAI: true, aiGenerated: false, unread: true,
    action: { type: 'order_planner_confirmation', orderId: String(order._id) },
  });
}

module.exports = { customerOrderNote, ensureOrderPlannerPrompt };
