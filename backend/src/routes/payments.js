const express = require('express');
const auth = require('../middleware/auth');
const Payment = require('../models/Payment');
const Refund = require('../models/Refund');
const Order = require('../models/Order');
const wechatPay = require('../utils/wechatPay');
const { confirmPayment, confirmRefund } = require('../utils/orderSettlement');
const router = express.Router();

function notifyError(res, err) {
  console.error('[wechat-pay-notify]', err);
  return res.status(500).json({ code: 'FAIL', message: err.message || '处理失败' });
}

router.post('/wechat/payment-notify', async (req, res) => {
  try {
    const raw = req.rawBody || JSON.stringify(req.body);
    if (!wechatPay.verifyNotifySignature(req.headers, raw)) {
      return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
    }
    const data = wechatPay.decryptResource(req.body.resource);
    if (data.trade_state === 'SUCCESS') {
      await confirmPayment({
        outTradeNo: data.out_trade_no,
        transactionId: data.transaction_id,
        paidAt: data.success_time ? new Date(data.success_time) : new Date(),
        snapshot: { eventType: req.body.event_type, tradeState: data.trade_state },
      });
    }
    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (err) { return notifyError(res, err); }
});

router.post('/wechat/refund-notify', async (req, res) => {
  try {
    const raw = req.rawBody || JSON.stringify(req.body);
    if (!wechatPay.verifyNotifySignature(req.headers, raw)) {
      return res.status(401).json({ code: 'FAIL', message: '签名验证失败' });
    }
    const data = wechatPay.decryptResource(req.body.resource);
    const refund = await Refund.findOne({ outRefundNo: data.out_refund_no });
    if (!refund) throw new Error('退款单不存在');
    refund.refundId = data.refund_id || refund.refundId;
    if (data.refund_status === 'SUCCESS') await confirmRefund(refund, { refundStatus: data.refund_status });
    else if (['ABNORMAL', 'CLOSED'].includes(data.refund_status)) {
      refund.status = data.refund_status === 'CLOSED' ? 'closed' : 'failed';
      refund.failureMessage = data.user_received_account || data.refund_status;
      await refund.save();
      await Order.updateOne({ _id: refund.order }, { refundStatus: 'failed' });
    }
    return res.status(200).json({ code: 'SUCCESS', message: '成功' });
  } catch (err) { return notifyError(res, err); }
});

router.get('/:orderId/status', auth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  const payment = await Payment.findOne({ order: order._id }).sort({ createdAt: -1 });
  if (payment?.status === 'processing') {
    try {
      const remote = await wechatPay.queryOrder(payment.outTradeNo);
      payment.lastQueriedAt = new Date();
      await payment.save();
      if (remote.trade_state === 'SUCCESS') {
        await confirmPayment({ outTradeNo: payment.outTradeNo, transactionId: remote.transaction_id, paidAt: remote.success_time ? new Date(remote.success_time) : new Date(), snapshot: { source: 'active_query', tradeState: remote.trade_state } });
      }
    } catch (err) {
      console.error('[wechat-pay-query]', err.message);
    }
  }
  if (['requested', 'processing'].includes(order.refundStatus)) {
    const refund = await Refund.findOne({ order: order._id, status: { $in: ['requested', 'processing'] } }).sort({ createdAt: -1 });
    if (refund) {
      try {
        const remote = await wechatPay.queryRefund(refund.outRefundNo);
        refund.refundId = remote.refund_id || refund.refundId;
        if (remote.status === 'SUCCESS') {
          await confirmRefund(refund, { source: 'active_query', refundStatus: remote.status });
        } else if (['ABNORMAL', 'CLOSED'].includes(remote.status)) {
          refund.status = remote.status === 'CLOSED' ? 'closed' : 'failed';
          refund.failureMessage = remote.user_received_account || remote.status;
          await refund.save();
          await Order.updateOne({ _id: refund.order }, { refundStatus: 'failed' });
        }
      } catch (err) {
        console.error('[wechat-refund-query]', err.message);
      }
    }
  }
  const fresh = await Order.findById(order._id);
  const latestPayment = await Payment.findOne({ order: order._id }).sort({ createdAt: -1 });
  res.json({ success: true, data: { order: fresh, payment: latestPayment } });
});

router.post('/:orderId/retry', auth, async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, user: req.user._id });
  if (!order) return res.status(404).json({ success: false, message: '订单不存在' });
  if (order.paymentStatus === 'paid') return res.json({ success: true, data: { order, alreadyPaid: true } });
  if (['closed', 'refunded'].includes(order.tradeStatus)) return res.status(409).json({ success: false, message: '订单已关闭，不能继续支付' });
  const payment = await Payment.findOne({ order: order._id, status: 'processing', channel: 'wechat_pay' }).sort({ createdAt: -1 });
  if (!payment?.prepayId) return res.status(409).json({ success: false, message: '原支付单已失效，请取消订单后重新下单' });
  try {
    const remote = await wechatPay.queryOrder(payment.outTradeNo);
    if (remote.trade_state === 'SUCCESS') {
      const paidOrder = await confirmPayment({ outTradeNo: payment.outTradeNo, transactionId: remote.transaction_id, paidAt: remote.success_time ? new Date(remote.success_time) : new Date(), snapshot: { source: 'retry_query', tradeState: remote.trade_state } });
      return res.json({ success: true, data: { order: paidOrder, alreadyPaid: true } });
    }
  } catch (err) { console.error('[wechat-pay-retry-query]', err.message); }
  if (!req.user.wechatMpOpenid) return res.status(400).json({ success: false, message: '请先绑定当前微信身份后再支付' });

  // A prepay_id is tied to the payer OpenID used when it was created. Reusing
  // an earlier prepay after the member refreshes their WeChat binding triggers
  // “下单账号与支付账号不一致”. Close it and create a fresh payment for the
  // current WeChat session instead.
  try { await wechatPay.closeOrder(payment.outTradeNo); } catch (err) { console.warn('[wechat-pay-retry-close]', err.message); }
  payment.status = 'closed';
  payment.closedAt = new Date();
  await payment.save();

  const outTradeNo = `JY${Date.now()}${order._id.toString().slice(-8)}`.slice(0, 32);
  const amount = Number(order.paymentExpectedAmount || payment.amount || 0);
  const nextPayment = await Payment.create({
    order: order._id, user: req.user._id, channel: 'wechat_pay', status: 'created', amount, outTradeNo,
  });
  try {
    const prepay = await wechatPay.createJsapiPayment({
      description: order.serviceName || '健康管理服务', outTradeNo, amount,
      openid: req.user.wechatMpOpenid, attach: order._id.toString(),
    });
    nextPayment.prepayId = prepay.prepayId;
    nextPayment.status = 'processing';
    await nextPayment.save();
    order.paymentId = nextPayment._id;
    order.paymentOutTradeNo = outTradeNo;
    await order.save();
    return res.json({ success: true, data: { order, paymentParams: prepay.client } });
  } catch (err) {
    nextPayment.status = 'failed';
    nextPayment.failureMessage = err.message;
    await nextPayment.save();
    return res.status(503).json({ success: false, message: `重新发起微信支付失败：${err.message}` });
  }
});

module.exports = router;
