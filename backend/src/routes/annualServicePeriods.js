const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const staffAuth = require('../middleware/staffAuth');
const AnnualPlan = require('../models/AnnualPlan');
const User = require('../models/User');
const Order = require('../models/Order');
const Period = require('../models/AnnualServicePeriod');
const { confirmAnnualServicePeriod, annualExecutionGate, isPaidAnnualOrder } = require('../utils/annualServicePeriod');
async function load(req, res) {
  if (!mongoose.isValidObjectId(req.params.planId)) { res.status(400).json({ success: false, message: '方案ID无效' }); return null; }
  const plan = await AnnualPlan.findById(req.params.planId).lean();
  if (!plan) { res.status(404).json({ success: false, message: '方案不存在' }); return null; }
  const patient = await User.findById(plan.patientId).select('assignedHealthPlanner assignedFamilyDoctor assignedHealthManager serviceStartDate serviceExpiry').lean();
  const field = { healthPlanner: 'assignedHealthPlanner', familyDoctor: 'assignedFamilyDoctor', healthManager: 'assignedHealthManager' }[req.staff.role];
  if (!patient || (req.staff.role !== 'superadmin' && (!field || String(patient[field] || '') !== String(req.staff._id)))) { res.status(403).json({ success: false, message: '无权查看该客户的续约凭据' }); return null; }
  return { plan, patient };
}
router.get('/annual-plans/:planId/service-period', staffAuth, async (req, res) => {
  try {
    const data = await load(req, res); if (!data) return;
    const [period, orders, activation] = await Promise.all([
      Period.findOne({ annualPlanId: data.plan._id }).lean(),
      Order.find({ user: data.patient._id, orderType: 'package', paymentStatus: 'paid' }).sort({ paidAt: -1 }).limit(50).lean(),
      annualExecutionGate(data.plan),
    ]);
    res.json({ success: true, data: { period, activation, orders: orders.filter(order => isPaidAnnualOrder(order, data.patient._id)).map(order => ({ _id: order._id, orderNo: order.orderNo, serviceName: order.serviceName, paidAt: order.paidAt })) } });
  } catch (error) { res.status(500).json({ success: false, message: '加载续约服务期失败' }); }
});
router.post('/annual-plans/:planId/service-period', staffAuth, async (req, res) => {
  try {
    const data = await load(req, res); if (!data) return;
    if (req.body.sourceType === 'paid_order' && !mongoose.isValidObjectId(req.body.sourceOrderId)) return res.status(400).json({ success: false, message: '请选择有效的年度订单' });
    const period = await confirmAnnualServicePeriod({ ...data, staff: req.staff, input: req.body });
    const activation = await annualExecutionGate(data.plan);
    let warning = '';
    if (activation.allowed) {
      try { const result = await require('../utils/annualPlanTaskSplit').syncAnnualPlanTaskSplit(data.plan); warning = (result.warnings || []).join('；'); }
      catch { warning = '服务期已确认，任务同步待系统重试'; }
    }
    res.json({ success: true, data: { period: await Period.findOne({ annualPlanId: data.plan._id }).lean() || period, activation, warning } });
  } catch (error) { res.status(error.code === 11000 ? 409 : error.statusCode || 500).json({ success: false, message: error.code === 11000 ? '该方案或续约凭据已被使用，请刷新核对' : error.statusCode ? error.message : '确认服务期失败，请稍后重试' }); }
});
router.post('/annual-plans/:planId/service-period/retry', staffAuth, async (req, res) => {
  try {
    const data = await load(req, res); if (!data) return;
    if (!['superadmin', 'healthPlanner', 'familyDoctor'].includes(req.staff.role)) return res.status(403).json({ success: false, message: '仅所属健康规划师或健康顾问可重试同步' });
    if (!data.plan.continuitySource?.previousPlanId) return res.status(409).json({ success: false, message: '此入口仅处理续年方案同步' });
    // 不接收新方案/合同字段，不重新审核、不重复确认；使用数据库已冻结的方案。
    let warning = '';
    try { const result = await require('../utils/annualPlanTaskSplit').syncAnnualPlanTaskSplit(data.plan); warning = (result.warnings || []).join('；'); }
    catch { warning = '同步尚未完成，请稍后重试'; }
    const period = await Period.findOne({ annualPlanId: data.plan._id }).lean();
    res.json({ success: true, data: { period, activation: await annualExecutionGate(data.plan), warning } });
  } catch { res.status(500).json({ success: false, message: '无法读取同步结果，请稍后重试' }); }
});
module.exports = router;
