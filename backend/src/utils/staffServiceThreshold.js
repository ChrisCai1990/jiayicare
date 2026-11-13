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
const quarterOf = date => {
  const [year, month] = monthOf(date).split('-').map(Number);
  return { year, firstMonth: Math.floor((month - 1) / 3) * 3 + 1 };
};
const quarterMonths = date => {
  const { year, firstMonth } = quarterOf(date);
  return [0, 1, 2].map(offset => `${year}-${String(firstMonth + offset).padStart(2, '0')}`);
};
const quarterEnd = date => monthEnd(quarterMonths(date)[2]);
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
  const quarter = quarterMonths(at);
  const events = (await Promise.all(quarter.map(item => monthlyServiceEvents(
    commission.tenantId, commission.staffId, item)))).flat();
  const monthTotals = new Map(quarter.map(item => [item, 0]));
  const monthEligible = new Map(quarter.map(item => [item, 0]));
  const eligibleRows = [];
  let eligibleCents = 0;
  let matchedCents = 0;
  for (const event of events) {
    const eventMonth = monthOf(event.at);
    const before = monthTotals.get(eventMonth) || 0;
    const monthlyExcess = excess(before, event.amountCents, rule.thresholdCents);
    monthTotals.set(eventMonth, before + event.amountCents);
    monthEligible.set(eventMonth, (monthEligible.get(eventMonth) || 0) + monthlyExcess);
    const isCurrent = event.orderId === String(order._id)
      && (commission.redemptionSequence == null || event.sequence === commission.redemptionSequence)
      && (!commission.serviceItemKey || event.key === commission.serviceItemKey);
    if (isCurrent) {
      matchedCents += event.amountCents;
    }
    eligibleRows.push({ ...event, isCurrent, monthlyExcess });
  }
  const quarterVolumeCents = [...monthTotals.values()].reduce((sum, value) => sum + value, 0);
  const quarterExcessCents = Math.max(0, quarterVolumeCents - rule.thresholdCents * 3);
  const monthlyExcessCents = [...monthEligible.values()].reduce((sum, value) => sum + value, 0);
  // Distribute the quarterly cap in event order. The final eligible event takes
  // any rounding remainder, so the entire quarter never pays above its net excess.
  let distributed = 0;
  let eligibleSeen = 0;
  for (const event of eligibleRows) {
    if (!event.monthlyExcess) continue;
    eligibleSeen += event.monthlyExcess;
    const allocated = Math.round(quarterExcessCents * eligibleSeen
      / Math.max(1, monthlyExcessCents)) - distributed;
    distributed += allocated;
    if (event.isCurrent) eligibleCents += allocated;
  }
  if (!matchedCents) {
    matchedCents = cents(commission.originalOrderAmount ?? commission.orderAmount);
    eligibleCents = 0;
  }
  const eligibleAt = new Date(Math.max(quarterEnd(at).getTime(),
    new Date(order.paidAt).getTime() + 30 * 86400000));
  return { ruleId: rule._id, ruleVersion: rule.version, thresholdCents: rule.thresholdCents,
    eligibleCents, totalCents: matchedCents, eligibleAt,
    quarterVolumeCents, quarterThresholdCents: rule.thresholdCents * 3,
    quarterExcessCents,
    ready: now >= eligibleAt,
    reason: now >= eligibleAt ? eligibleCents ? '' : '本月或本季度服务业务量未超过基础门槛'
      : '等待自然季度结算且订单支付满30天' };
}

module.exports = { serviceThresholdForCommission, monthlyServiceEvents, excess,
  monthOf, monthEnd, quarterOf, quarterMonths, quarterEnd };
