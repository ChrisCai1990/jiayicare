// 仅约束年度来源的新周期，不撤销已开始服务，也不限制独立订单履约。
async function annualPeriodicGate(plan, user, now = new Date()) {
  if (!plan || !user || String(plan.patientId) !== String(user._id)) return { allowed: false, reason: '年度来源或客户不匹配' };
  const access = await require('./serviceAccess').resolveServiceAccess(user, now);
  if (!access.active) return { allowed: false, access, reason: access.reason };
  // 旧年度不能借下一年度的有效权益继续无限生成周期任务。
  if (!plan.continuitySource?.previousPlanId && access.source === 'verified_renewal') {
    return { allowed: false, access, reason: '已进入新的年度服务期，旧年度不再启动新周期' };
  }
  const gate = await require('./annualServicePeriod').annualExecutionGate(plan, now);
  return { ...gate, access };
}

async function canStartAnnualSupplyCycle(supply, user, now = new Date()) {
  if (!supply.sourceAnnualPlanId) return true; // 独立订单/人工补给仍按既有履约规则。
  const plan = await require('../models/AnnualPlan').findById(supply.sourceAnnualPlanId).lean();
  const gate = await annualPeriodicGate(plan, user, now);
  if (!gate.allowed) return false;
  const dueDay = require('./serviceAccess').dayOf(supply.nextDueDate);
  const { startDate, endDate } = gate.period || gate.access;
  return Boolean(dueDay && (!startDate || dueDay >= startDate) && (!endDate || dueDay <= endDate));
}

module.exports = { annualPeriodicGate, canStartAnnualSupplyCycle };
