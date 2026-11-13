const Order = require('../models/Order');
const StaffServiceThresholdRule = require('../models/StaffServiceThresholdRule');
const Commission = require('../models/Commission');
const { serviceVolumeEvents } = require('./partnerTeamEarning');

const cents = value => Math.round(Number(value || 0) * 100);
const monthOf = date => new Date(new Date(date).getTime() + 8 * 3600000).toISOString().slice(0, 7);
const monthEnd = key => {
  const [year, month] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month, 1) - 8 * 3600000);
};
const excess = (before, amount, threshold) => Math.max(0,
  before + amount - Math.max(before, threshold));

async function monthlyServiceEvents(tenantId, staffId, month) {
  const events = [];
  const [year, monthNumber] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(year, monthNumber - 1, 1) - 8 * 3600000);
  const window = { $gte: monthStart, $lt: monthEnd(month) };
  const cursor = Order.find({ tenantId, paymentStatus: { $in: ['paid', 'refunded'] },
    $and: [
      { $or: [{ 'servicePerformers.staffId': staffId }, { fulfillerId: staffId }] },
      { $or: [{ verifiedAt: window }, { completedAt: window }, { 'redemptions.redeemedAt': window }] },
    ] })
    .select('_id status tradeStatus paidAt paidAmount refundedAmount paymentStatus refundStatus verifiedAt completedAt redemptions totalUnits serviceItemsSnapshot businessAllocationsSnapshot servicePerformers fulfillerId')
    .lean().cursor();
  for await (const item of cursor) for (const event of serviceVolumeEvents(item)) {
    if (String(event.staffId) === String(staffId) && monthOf(event.at) === month)
      events.push({ ...event, orderId: String(item._id) });
  }
  const legacy = await Commission.find({ tenantId, staffId, role: 'fulfiller',
    createdAt: { $gte: monthStart, $lt: monthEnd(month) },
    status: { $ne: 'cancelled' } }).select('_id orderId createdAt orderAmount originalOrderAmount redemptionSequence serviceItemKey').lean();
  for (const item of legacy) {
    const orderId = String(item.orderId);
    if (events.some(event => event.orderId === orderId
      && (item.redemptionSequence == null || event.sequence === item.redemptionSequence)
      && (!item.serviceItemKey || event.key === item.serviceItemKey))) continue;
    events.push({ orderId, staffId, key: item.serviceItemKey || '',
      sequence: item.redemptionSequence || 0, at: item.createdAt,
      amountCents: cents(item.orderAmount || item.originalOrderAmount) });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at)
    || a.orderId.localeCompare(b.orderId) || a.sequence - b.sequence || a.key.localeCompare(b.key));
  return events;
}

async function serviceThresholdForCommission(order, commission, now = new Date()) {
  if (commission.role !== 'fulfiller' || !commission.createdAt) return null;
  const currentEvents = serviceVolumeEvents(order).filter(event =>
    String(event.staffId) === String(commission.staffId)
      && (commission.redemptionSequence == null || event.sequence === commission.redemptionSequence)
      && (!commission.serviceItemKey || event.key === commission.serviceItemKey));
  const at = currentEvents[0]?.at || commission.createdAt;
  const rule = commission.serviceThresholdRuleId
    ? await StaffServiceThresholdRule.findOne({ _id: commission.serviceThresholdRuleId,
      tenantId: commission.tenantId, staffId: commission.staffId }).lean()
    : await StaffServiceThresholdRule.findOne({ tenantId: commission.tenantId,
      staffId: commission.staffId, effectiveFrom: { $lte: at },
      $or: [{ effectiveUntil: null }, { effectiveUntil: { $gt: at } }] })
      .sort({ version: -1 }).lean();
  if (!rule || rule.thresholdCents === 0) return null;
  const month = monthOf(at);
  const events = await monthlyServiceEvents(commission.tenantId, commission.staffId, month);
  let before = 0;
  let eligibleCents = 0;
  let matchedCents = 0;
  for (const event of events) {
    const isCurrent = event.orderId === String(order._id)
      && (commission.redemptionSequence == null || event.sequence === commission.redemptionSequence)
      && (!commission.serviceItemKey || event.key === commission.serviceItemKey);
    if (isCurrent) {
      eligibleCents += excess(before, event.amountCents, rule.thresholdCents);
      matchedCents += event.amountCents;
    }
    before += event.amountCents;
  }
  if (!matchedCents) {
    matchedCents = cents(commission.originalOrderAmount ?? commission.orderAmount);
    eligibleCents = excess(Math.max(0, before - matchedCents), matchedCents, rule.thresholdCents);
  }
  const eligibleAt = new Date(Math.max(monthEnd(month).getTime(),
    new Date(order.paidAt).getTime() + 30 * 86400000));
  return { ruleId: rule._id, ruleVersion: rule.version, thresholdCents: rule.thresholdCents,
    eligibleCents, totalCents: matchedCents, eligibleAt,
    ready: now >= eligibleAt,
    reason: now >= eligibleAt ? eligibleCents ? '' : '本月服务业务量未超过基础门槛'
      : '等待自然月结算且订单支付满30天' };
}

module.exports = { serviceThresholdForCommission, monthlyServiceEvents, excess, monthOf, monthEnd };
