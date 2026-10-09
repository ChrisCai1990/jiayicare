const express = require('express');
const Order = require('../models/Order');
const User = require('../models/User');
const Fulfillment = require('../models/Fulfillment');
const FollowUp = require('../models/FollowUp');
const staffAuth = require('../middleware/staffAuth');
const { isIbdOrder } = require('../utils/ibdServiceTerms');

const router = express.Router();
router.use(staffAuth);

function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00+08:00`);
  return Number.isNaN(date.getTime()) || date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }) !== value ? null : date;
}

router.post('/:id/escort', async (req, res) => {
  try {
    if (!['healthManager', 'superadmin'].includes(req.staff.role))
      return res.status(403).json({ success: false, message: '请由健管专员或陪诊执行人登记实际陪诊' });
    const order = await Order.findById(req.params.id).lean();
    if (!order || !isIbdOrder(order)) return res.status(404).json({ success: false, message: 'IBD 年度订单不存在' });
    if (order.paymentStatus !== 'paid' || !['pending', 'scheduled'].includes(order.status) || ['closed', 'refunded'].includes(order.tradeStatus))
      return res.status(409).json({ success: false, message: '订单未付款或已结束，不能登记陪诊' });
    const patient = await User.findById(order.user).select('assignedHealthManager').lean();
    if (req.staff.role === 'healthManager' && String(patient?.assignedHealthManager || '') !== String(req.staff._id))
      return res.status(403).json({ success: false, message: '只能登记本人负责客户的陪诊' });
    const visitDate = day(req.body.visitDate);
    const hospital = String(req.body.hospital || '').trim().slice(0, 150);
    const department = String(req.body.department || '').trim().slice(0, 100);
    const expert = String(req.body.expert || '').trim().slice(0, 100);
    const companion = String(req.body.companion || '').trim().slice(0, 100);
    const evidence = String(req.body.evidence || '').trim().slice(0, 1000);
    if (!visitDate || !hospital || !companion || evidence.length < 10)
      return res.status(400).json({ success: false, message: '请填写实际就诊日期、医院、陪诊人及至少 10 字的完成凭据' });
    const period = order.specialtyService || {};
    if (!period.startsAt || !period.endsAt || visitDate < new Date(period.startsAt) || visitDate >= new Date(period.endsAt))
      return res.status(409).json({ success: false, message: '陪诊日期不在本年度服务期内，请由健康顾问核对' });
    const visitKey = `${req.body.visitDate}:${hospital.toLowerCase()}:${companion.toLowerCase()}`;
    const updated = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: 'paid', status: { $in: ['pending', 'scheduled'] },
      'specialtyService.usedEscorts': { $lt: Number(period.includedEscorts || 0) },
      'specialtyService.escortRecords.visitKey': { $ne: visitKey } },
    { $inc: { 'specialtyService.usedEscorts': 1 },
      $push: { 'specialtyService.escortRecords': { visitKey, visitDate, hospital, department, expert, companion, evidence,
        recordedBy: req.staff._id, recordedAt: new Date() } },
      $set: { status: 'scheduled', tradeStatus: 'fulfilling' } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '陪诊已登记或次数已用完，请刷新核对' });
    return res.json({ success: true, data: updated, message: `陪诊已登记，已使用 ${updated.specialtyService.usedEscorts}/${updated.specialtyService.includedEscorts} 次；年度服务继续进行` });
  } catch (error) { return res.status(500).json({ success: false, message: '陪诊登记失败' }); }
});

router.post('/:id/close', async (req, res) => {
  try {
    if (!['familyDoctor', 'superadmin'].includes(req.staff.role))
      return res.status(403).json({ success: false, message: '请由负责健康顾问完成年度回顾' });
    const order = await Order.findById(req.params.id).lean();
    if (!order || !isIbdOrder(order)) return res.status(404).json({ success: false, message: 'IBD 年度订单不存在' });
    if (order.paymentStatus !== 'paid' || !['pending', 'scheduled'].includes(order.status))
      return res.status(409).json({ success: false, message: '订单尚未付款或已结束' });
    const patient = await User.findById(order.user).select('assignedFamilyDoctor').lean();
    if (req.staff.role !== 'superadmin' && String(patient?.assignedFamilyDoctor || '') !== String(req.staff._id))
      return res.status(403).json({ success: false, message: '仅该客户的健康顾问可结案' });
    if (!order.specialtyService?.endsAt || new Date(order.specialtyService.endsAt) > new Date())
      return res.status(409).json({ success: false, message: '管理期限尚未结束；如需提前终止，请走取消或退款流程' });
    const summary = String(req.body.summary || '').trim();
    if (summary.length < 20 || summary.length > 5000)
      return res.status(400).json({ success: false, message: '请填写 20 至 5000 字的年度回顾与未完成事项' });
    const now = new Date();
    const updated = await Order.findOneAndUpdate({ _id: order._id, paymentStatus: 'paid', status: { $in: ['pending', 'scheduled'] },
      'specialtyService.endsAt': { $lte: now }, 'specialtyService.closedAt': null },
    { $set: { status: 'completed', tradeStatus: 'completed', fulfillmentStatus: 'completed', completedAt: now,
      'specialtyService.annualSummary': summary, 'specialtyService.closedBy': req.staff._id, 'specialtyService.closedAt': now } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '订单状态已变化，请刷新核对' });
    await Fulfillment.updateOne({ order: updated._id }, { $set: { status: 'completed', completedAt: now } });
    await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: updated._id, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'completed', completedAt: now, completedBy: 'staff' } });
    return res.json({ success: true, data: updated, message: '年度回顾已确认并结案；未使用陪诊次数保留在历史记录中' });
  } catch (error) { return res.status(500).json({ success: false, message: '年度结案失败' }); }
});

module.exports = router;
