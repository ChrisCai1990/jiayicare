const router = require('express').Router();
const Order = require('../models/Order');
const User = require('../models/User');
const Fulfillment = require('../models/Fulfillment');
const { activeOrderWorkItemQuery } = require('../utils/orderWorkItem');
const { isShippingOrder, hasShippingHandoff } = require('../../../shared/orderShipping.cjs');

router.use((req, res, next) => ['healthManager', 'superadmin'].includes(req.staff.role)
  ? next() : res.status(403).json({ success: false, message: '仅健管专员可处理发货' }));

async function scope(staff) {
  const patients = await User.find(staff.role === 'superadmin' ? {} : { assignedHealthManager: staff._id }).distinct('_id');
  return { ...activeOrderWorkItemQuery(), user: { $in: patients }, status: 'scheduled' };
}
router.get('/', async (req, res) => {
  try {
    // Read-only projection also covers legacy confirmations; no duplicate task or migration.
    const orders = await Order.find(await scope(req.staff)).populate('user', 'name deliveryAddress contactPhone phone').sort({ createdAt: 1 }).lean();
    const candidates = orders.filter(hasShippingHandoff);
    const shipped = await Fulfillment.find({ order: { $in: candidates.map(o => o._id) }, status: { $in: ['shipped', 'completed', 'cancelled'] } }).distinct('order');
    const excluded = new Set(shipped.map(String));
    res.json({ success: true, data: candidates.filter(o => !['shipped', 'completed', 'cancelled'].includes(o.fulfillmentStatus) && !excluded.has(String(o._id))) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
router.patch('/:id', async (req, res) => {
  try {
    const deliveryCompany = String(req.body.deliveryCompany || '').trim().slice(0, 100);
    const trackingNo = String(req.body.trackingNo || '').trim().slice(0, 100);
    if (!deliveryCompany || !trackingNo) return res.status(400).json({ success: false, message: '请填写快递公司和运单号' });
    const filter = { ...await scope(req.staff), _id: req.params.id };
    const order = await Order.findOne(filter);
    if (!order || !hasShippingHandoff(order)) return res.status(409).json({ success: false, message: '订单尚未由健康规划师确认发货，或不属于当前专员' });
    const fulfillment = await Fulfillment.findOneAndUpdate({ order: order._id }, { $setOnInsert: {
      order: order._id, user: order.user, type: 'delivery_and_service', status: 'awaiting_shipment',
    } }, { upsert: true, new: true });
    if (['shipped', 'completed', 'cancelled'].includes(fulfillment.status)) return res.status(409).json({ success: false, message: '该订单已处理，请刷新列表' });
    const updated = await Fulfillment.findOneAndUpdate({ _id: fulfillment._id, status: fulfillment.status }, { $set: {
      status: 'shipped', deliveryCompany, trackingNo, assignedStaff: [req.staff._id],
    } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: '发货状态已变化，请刷新列表' });
    await Order.updateOne(filter, { $set: { fulfillmentId: updated._id, fulfillmentStatus: 'shipped', tradeStatus: 'fulfilling', currentStage: 'shipping', currentAssignee: req.staff._id } });
    res.json({ success: true, message: '已登记发货', data: updated });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});
module.exports = router;
