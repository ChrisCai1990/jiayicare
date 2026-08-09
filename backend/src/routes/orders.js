const express = require('express');
const auth = require('../middleware/auth');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const { refundOrderPoints } = require('../utils/orderPoints');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const wechatPay = require('../utils/wechatPay');
const { confirmRefund } = require('../utils/orderSettlement');
const router = express.Router();

async function reconcileRefund(order) {
  if (!['requested', 'processing'].includes(order.refundStatus)) return;
  const refund = await Refund.findOne({ order: order._id, status: { $in: ['requested', 'processing'] } }).sort({ createdAt: -1 });
  if (!refund || refund.status === 'requested') return;
  try {
    const remote = await wechatPay.queryRefund(refund.outRefundNo);
    refund.refundId = remote.refund_id || refund.refundId;
    if (remote.status === 'SUCCESS') {
      await confirmRefund(refund, { source: 'orders_list_query', refundStatus: remote.status });
    } else if (['ABNORMAL', 'CLOSED'].includes(remote.status)) {
      refund.status = remote.status === 'CLOSED' ? 'closed' : 'failed';
      refund.failureMessage = remote.user_received_account || remote.status;
      await refund.save();
      await Order.updateOne({ _id: refund.order }, { refundStatus: 'failed' });
    }
  } catch (err) {
    console.error('[orders-refund-query]', err.message);
  }
}

// 获取当前用户的订单列表
router.get('/', auth, async (req, res) => {
  try {
    let orders = await Order.find({ user: req.user._id })
      .populate('paymentId')
      .populate('fulfillmentId')
      .sort({ createdAt: -1 })
      .limit(50);
    await Promise.all(orders.filter(order => order.refundStatus === 'processing').map(reconcileRefund));
    if (orders.some(order => order.refundStatus === 'processing')) {
      orders = await Order.find({ user: req.user._id })
        .populate('paymentId')
        .populate('fulfillmentId')
        .sort({ createdAt: -1 })
        .limit(50);
    }
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取订单失败', error: err.message });
  }
});

// 获取单个订单详情
router.get('/:id', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: '获取订单失败', error: err.message });
  }
});

// 取消订单（仅限 pending 状态）
router.patch('/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
    if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, message: '该订单状态不可取消' });
    }
    if (order.paymentStatus === 'paid' || ['paid', 'fulfilling'].includes(order.tradeStatus)) {
      return res.status(409).json({ success: false, message: '已支付订单不能直接取消，请提交退款申请' });
    }
    const payment = await Payment.findOne({ order: order._id, status: 'processing' }).sort({ createdAt: -1 });
    if (payment) {
      try { await wechatPay.closeOrder(payment.outTradeNo); } catch (err) { console.error('[close-payment]', err.message); }
      payment.status = 'closed'; payment.closedAt = new Date(); await payment.save();
    }
    order.status = 'cancelled';
    order.tradeStatus = 'closed';
    await order.save();
    await require('../utils/healthFundPayment').reverseHealthFund({ order, remark: `订单${order.serviceName}取消返还` });
    if (order.couponId) {
      const Coupon = require('../models/Coupon');
      await Coupon.updateOne(
        { _id: order.couponId, usedOrderId: order._id, status: 'used' },
        { status: 'active', usedAt: null, usedOrderId: null },
      );
    }
    await refundOrderPoints(order); // 若下单时预记过消费积分，取消订单要退回
    // 联动取消该订单生成的随访待办（sourceType='order'），此前只改订单状态，随访记录仍是 planned，
    // 导致用户端"待办任务"和医护端工作台永久残留一条订单已取消却还在等安排的僵尸待办
    await FollowUp.updateMany(
      { sourceOrderId: order._id, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'cancelled', cancelReason: '订单已取消' } }
    );
    res.json({ success: true, message: '订单已取消', data: order });
  } catch (err) {
    res.status(500).json({ success: false, message: '取消失败', error: err.message });
  }
});

router.post('/:id/refund-request', auth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.paymentStatus !== 'paid') return res.status(400).json({ success: false, message: '只有已支付订单可以申请退款' });
  if (order.status === 'completed') return res.status(409).json({ success: false, message: '服务已全部完成，请联系客服核对可退款金额' });
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: '请输入退款原因' });
  const payment = await Payment.findOne({ order: order._id, status: 'succeeded', channel: 'wechat_pay' }).sort({ createdAt: -1 });
  if (!payment && !(order.healthFundAmount > 0)) return res.status(409).json({ success: false, message: '未找到可原路退回的支付记录，请联系客服' });
  const existing = await Refund.findOne({ order: order._id, status: { $in: ['requested', 'processing', 'succeeded'] } });
  if (existing) return res.json({ success: true, data: existing, message: '退款申请已提交，请勿重复申请' });
  const refund = await Refund.create({
    order: order._id, payment: payment?._id || null, user: req.user._id,
    outRefundNo: `RF${Date.now()}${order._id.toString().slice(-8)}`.slice(0, 32),
    amount: payment?.amount || 0, totalAmount: payment?.amount || 0, reason, status: 'requested',
  });
  order.tradeStatus = 'refund_pending'; order.refundStatus = 'requested'; await order.save();
  res.json({ success: true, data: refund, message: '退款申请已提交，工作人员审核后将原路退回' });
});

module.exports = router;
