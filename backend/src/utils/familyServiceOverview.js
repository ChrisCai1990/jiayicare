const statusLabels = {
  created: '待确认', awaiting_payment: '待支付', paid: '待安排', fulfilling: '服务中',
  partially_refunded: '服务中', pending: '待安排', scheduled: '已安排',
  in_progress: '服务中', processing: '处理中', pending_review: '待审核',
  awaiting_confirmation: '待确认', awaiting_schedule: '待安排',
};
function statusLabel(order) {
  if (order.tradeStatus === 'awaiting_payment') return '待支付';
  return statusLabels[order.fulfillmentStatus] || statusLabels[order.status] || statusLabels[order.tradeStatus] || '处理中';
}
function activeFilter(userId, tenantId) {
  return {
    user: userId, tenantId: tenantId || null,
    orderType: { $in: ['service', null] },
    status: { $nin: ['completed', 'cancelled'] },
    tradeStatus: { $nin: ['completed', 'closed', 'refunded', 'refund_pending'] },
    fulfillmentStatus: { $nin: ['completed', 'cancelled', 'closed', 'refunded'] },
    paymentStatus: { $ne: 'refunded' },
    refundStatus: { $nin: ['refunded', 'requested', 'processing'] },
  };
}
const denied = () => Object.assign(new Error('未建立有效的双向家庭关联'), {status: 403});
async function loadOverview(actor, memberId, models) {
  const User = models?.User || require('../models/User');
  const Order = models?.Order || require('../models/Order');
  const scope = {tenantId: actor.tenantId || null, isDeleted: {$ne: true}};
  const owner = await User.findOne({_id: actor._id, ...scope}).select('familyLinks').lean();
  const link = owner?.familyLinks?.find(x => String(x.linkedUser) === String(memberId));
  if (!link || String(actor._id) === String(memberId)) throw denied();
  const member = await User.findOne({_id: memberId, ...scope}).select('name familyLinks').lean();
  if (!member?.familyLinks?.some(x => String(x.linkedUser) === String(actor._id))) throw denied();
  const filter = activeFilter(member._id, actor.tenantId);
  const [activeCount, latest, appointments] = await Promise.all([
    Order.countDocuments(filter),
    Order.findOne(filter).select('serviceName status tradeStatus fulfillmentStatus').sort({createdAt: -1, _id: -1}).lean(),
    Order.find({...filter, $or: [{scheduledAt: {$type: 'date'}}, {desiredServiceDate: {$type: 'date'}}]})
      .select('serviceName status tradeStatus fulfillmentStatus scheduledAt desiredServiceDate')
      .sort({createdAt: -1, _id: -1}).limit(5).lean(),
  ]);
  return {
    member: {_id: member._id, name: member.name || '家庭成员', relation: link.relation || '家庭成员'},
    service: {activeCount, latestStatus: latest ? statusLabel(latest) : '', latestServiceName: latest?.serviceName || ''},
    appointments: appointments.map(row => ({serviceName: row.serviceName || '服务安排', status: statusLabel(row),
      scheduledAt: row.scheduledAt || null, desiredServiceDate: row.desiredServiceDate || null,
      dateLabel: row.scheduledAt ? '已安排' : '期望日期（待确认）'})),
  };
}
module.exports = {loadOverview, activeFilter, statusLabel};
