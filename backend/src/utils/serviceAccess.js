const { isPaidAnnualOrder } = require('./annualServicePeriod');
const chinaDay = now => new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10);
function dayOf(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? chinaDay(date) : '';
}
function legacyAccess(user, now = new Date()) {
  const startDate = dayOf(user.serviceStartDate);
  const endDate = dayOf(user.serviceExpiry);
  const today = chinaDay(now);
  const active = (!startDate || today >= startDate) && (!endDate || today <= endDate);
  return { active, source: 'legacy', startDate, endDate, reason: active ? '' : startDate > today ? '服务期尚未开始' : '服务期已结束' };
}

// 服务使用权与年度方案确认分开：凭据生效即可使用服务，方案任务仍走 annualExecutionGate。
// 一旦进入新凭据周期，不再回退到可编辑的档案日期，以免退款/到期后被旧日期放行。
async function resolveServiceAccess(user, now = new Date(), models = {}) {
  if (!user || user.isDeleted) return { active: false, source: 'unavailable', reason: '客户档案不可用', startDate: '', endDate: '' };
  const Period = models.Period || require('../models/AnnualServicePeriod');
  const Order = models.Order || require('../models/Order');
  const periods = await Period.find({ patientId: user._id, confirmedAt: { $ne: null } }).sort({ startDate: 1 }).lean();
  if (!periods.length) return legacyAccess(user, now);
  const today = chinaDay(now);
  const validDates = periods.filter(p => dayOf(p.startDate) === p.startDate && dayOf(p.endDate) === p.endDate && p.startDate && p.endDate >= p.startDate);
  for (const period of [...validDates].reverse()) {
    if (period.startDate > today || period.endDate < today) continue;
    const valid = period.sourceType === 'offline_contract'
      ? Boolean(period.contractReference && period.confirmedBy && period.evidenceSnapshot?.verifiedByPlanner)
      : period.sourceType === 'paid_order' && isPaidAnnualOrder(await Order.findById(period.sourceOrderId).lean(), user._id);
    if (valid) return { active: true, source: 'verified_renewal', startDate: period.startDate, endDate: period.endDate, reason: '' };
  }
  const first = validDates[0];
  if (first && today < first.startDate) {
    const previous = legacyAccess(first.legacyServiceWindow || user, now);
    // 新凭据开始前只延续旧期，不把未来凭据当作当前可用权限。
    return { ...previous, nextStartDate: first.startDate };
  }
  return { active: false, source: 'verified_renewal', startDate: '', endDate: '', reason: '当前没有已生效且有效的续约服务期' };
}
module.exports = { resolveServiceAccess, legacyAccess, dayOf, chinaDay };
