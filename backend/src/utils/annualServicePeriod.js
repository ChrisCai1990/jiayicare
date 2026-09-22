const fail = message => Object.assign(new Error(message), { statusCode: 409 });
const chinaDay = now => new Date(new Date(now).getTime() + 8 * 3600000).toISOString().slice(0, 10);
function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isPaidAnnualOrder(order, patientId) {
  return Boolean(order && String(order.user) === String(patientId) && order.orderType === 'package'
    && order.paymentStatus === 'paid' && order.status !== 'cancelled'
    && !['closed', 'refund_pending', 'partially_refunded', 'refunded'].includes(order.tradeStatus)
    && ['', 'none', 'failed'].includes(order.refundStatus || '')
    && (order.annualServiceSnapshot?.durationMonths === 12 || (!order.annualServiceSnapshot && order.serviceId === 'pkg_1y')));
}
function validatePeriodDates(startDate, endDate, year) {
  if (!validDay(startDate) || !validDay(endDate) || endDate < startDate) throw fail('请填写有效的服务期起止日期');
  if (Number(startDate.slice(0, 4)) !== Number(year)) throw fail('服务开始年份须与当前年度方案一致');
  const days = (new Date(endDate) - new Date(startDate)) / 86400000 + 1;
  if (days < 365 || days > 366) throw fail('年度服务期须为365或366天；其他期限请单独核对，不能按年度续约启用');
}
function validatePlanPeriodDates(plan, startDate, endDate) {
  for (const module of Object.values(plan.moduleData || {})) {
    if (!module || module.enabled === false) continue;
    for (const row of Array.isArray(module.records) ? module.records : [module]) {
      for (const key of ['visit_time', 'plan_time', 'time', 'date', 'executionDate', 'collaborationDate']) {
        const day = String(row?.[key] || '').slice(0, 10);
        if (validDay(day) && (day < startDate || day > endDate)) throw fail('方案中有执行日期超出续约服务期，请健康顾问先调整草稿日期');
      }
    }
  }
}
async function buildServicePeriodEvidence({ plan, patient, input }, models = {}) {
  const Order = models.Order || require('../models/Order');
  const { startDate, endDate, sourceType } = input;
  validatePeriodDates(startDate, endDate, plan.year);
  let evidenceSnapshot; let sourceOrderId; let contractReference = '';
  if (sourceType === 'paid_order') {
    const order = await Order.findById(input.sourceOrderId).lean();
    if (!isPaidAnnualOrder(order, patient._id)) throw fail('须选择该客户已支付、未退款的年度服务订单');
    sourceOrderId = order._id;
    evidenceSnapshot = { orderNo: order.orderNo, serviceId: order.serviceId, serviceName: order.serviceName, paidAt: order.paidAt, paymentStatus: order.paymentStatus, annualServiceSnapshot: order.annualServiceSnapshot || { durationMonths: 12, legacyCode: 'pkg_1y' } };
  } else if (sourceType === 'offline_contract') {
    contractReference = String(input.contractReference || '').trim();
    if (!contractReference || contractReference.length > 200 || input.verified !== true) throw fail('请填写线下合同编号，并确认已核验合同及服务期');
    evidenceSnapshot = { contractReference, verifiedByPlanner: true };
  } else throw fail('续约凭据类型无效');
  return { startDate, endDate, sourceType, sourceOrderId, contractReference, evidenceSnapshot };
}
async function confirmAnnualServicePeriod({ plan, patient, staff, input }, models = {}) {
  const Period = models.Period || require('../models/AnnualServicePeriod');
  if (staff.role !== 'superadmin' && (staff.role !== 'healthPlanner' || String(patient.assignedHealthPlanner || '') !== String(staff._id))) throw Object.assign(new Error('仅客户所属健康规划师可核对续约服务期'), { statusCode: 403 });
  if (!plan.continuitySource?.previousPlanId) throw fail('此入口仅用于下一年度方案续约，不修改首次服务期');
  if (String(plan.patientId) !== String(patient._id)) throw fail('方案与客户不匹配');
  const { startDate, endDate, sourceType, sourceOrderId, contractReference, evidenceSnapshot } = await buildServicePeriodEvidence({ plan, patient, input }, models);
  validatePlanPeriodDates(plan, startDate, endDate);
  const previous = await Period.findOne({ annualPlanId: plan.continuitySource.previousPlanId }).lean();
  if (previous && startDate <= previous.endDate) throw fail('新服务期不能与上一年度已确认服务期重叠');
  const existing = await Period.findOne({ annualPlanId: plan._id }).lean();
  if (existing) {
    if (existing.sourceType === sourceType && existing.startDate === startDate && existing.endDate === endDate && String(existing.sourceOrderId || '') === String(sourceOrderId || '') && existing.contractReference === contractReference) return existing;
    throw fail('服务期已有确认记录，不能覆盖原凭据；请核对后走更正流程');
  }
  const legacyServiceWindow = previous?.legacyServiceWindow || { serviceStartDate: patient.serviceStartDate || '', serviceExpiry: patient.serviceExpiry || '' };
  if (sourceOrderId) {
    await require('./annualServiceOrderEvidence').requireEvidenceIndex(Period);
    if (await Period.findOne({ $or: [{ sourceOrderId }, { evidenceOrderIds: sourceOrderId }] }).lean()) throw fail('该年度订单已作为其他年度的当前或历史续约凭据使用');
  }
  return Period.create({ patientId: patient._id, annualPlanId: plan._id, sourceType, ...(sourceOrderId ? { sourceOrderId, evidenceOrderIds: [sourceOrderId] } : {}), contractReference, startDate, endDate, evidenceSnapshot, legacyServiceWindow, confirmedBy: staff._id, confirmedAt: new Date() });
}

async function annualExecutionGate(plan, now = new Date(), models = {}) {
  if (!require('./healthManagementRollout').enabledForPatient(plan.patientId)) {
    // No new renewal work may resume for a customer removed from the pilot.
    if (plan.continuitySource?.previousPlanId) return { allowed: false, reason: '该客户暂未开放新版健康管理闭环' };
    return { allowed: !!plan.confirmedAt, anchor: plan.confirmedAt, reason: plan.confirmedAt ? '' : '等待客户确认方案' };
  }
  if (!plan.confirmedAt) return { allowed: false, reason: '等待客户确认方案' };
  if (!plan.continuitySource?.previousPlanId) return { allowed: true, anchor: plan.confirmedAt }; // 保留首次/历史方案路径。
  if (!plan.pushedAt || plan.reviewStatus !== 'approved') return { allowed: false, reason: '等待顾问审核发布' };
  const Period = models.Period || require('../models/AnnualServicePeriod');
  const Order = models.Order || require('../models/Order');
  const period = await Period.findOne({ annualPlanId: plan._id, patientId: plan.patientId }).lean();
  if (!period?.confirmedAt) return { allowed: false, reason: '等待健康规划师核验续约凭据及服务期' };
  const blocked = (reason, code, role = 'healthPlanner') => ({ allowed: false, reason, period, issue: { code, role, message: reason } });
  if (period.sourceType === 'paid_order') {
    const order = await Order.findById(period.sourceOrderId).lean();
    if (!isPaidAnnualOrder(order, plan.patientId)) return blocked('续约订单已失效或退款，请核对服务安排；暂不派发新任务', 'invalid_order');
  } else if (period.sourceType !== 'offline_contract' || !period.contractReference) return blocked('续约凭据无效，请核对合同', 'invalid_evidence');
  const today = chinaDay(now);
  if (!validDay(period.startDate) || !validDay(period.endDate) || period.endDate < period.startDate) return blocked('服务期日期无效，请核对合同服务期', 'invalid_period');
  let executionPlan;
  try {
    executionPlan = require('./annualScheduleAmendments').projectAnnualSchedule(plan, period.scheduleAmendments || []);
    validatePlanPeriodDates(executionPlan, period.startDate, period.endDate);
  }
  catch (error) { return blocked(error.message, 'plan_dates', 'familyDoctor'); }
  if (today < period.startDate) return { allowed: false, period, reason: `等待服务期开始（${period.startDate}）` };
  if (today > period.endDate) return { allowed: false, period, reason: '该年度服务期已结束' };
  const anchor = new Date(Math.max(new Date(plan.confirmedAt).getTime(), period.executionAnchor ? new Date(period.executionAnchor).getTime() : new Date(`${period.startDate}T00:00:00+08:00`).getTime()));
  if (!Number.isFinite(anchor.getTime())) return blocked('年度执行起点无效，请联系管理员核对', 'invalid_anchor');
  return { allowed: true, period, anchor, executionPlan };
}
module.exports = { confirmAnnualServicePeriod, annualExecutionGate, isPaidAnnualOrder, validatePeriodDates, validatePlanPeriodDates, buildServicePeriodEvidence };
