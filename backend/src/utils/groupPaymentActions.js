const crypto = require('crypto');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const wechatPay = require('./wechatPay');
const { paymentOrderQuery, paymentAllocations } = require('./checkoutAmounts');

async function withGroupLock(order, work) {
  const token = crypto.randomBytes(16).toString('hex');
  const claimed = await Order.findOneAndUpdate({ _id: order.checkoutGroupId, user: order.user,
    $or: [{ checkoutActionLockUntil: null }, { checkoutActionLockUntil: { $lt: new Date() } }],
  }, { $set: { checkoutActionLockUntil: new Date(Date.now() + 120000), checkoutActionLockToken: token } }, { new: true });
  if (!claimed) throw new Error('合并订单正在处理，请稍后刷新');
  try { return await work(); }
  finally { await Order.updateOne({ _id: order.checkoutGroupId, checkoutActionLockToken: token }, { $set: { checkoutActionLockUntil: null, checkoutActionLockToken: '' } }); }
}

async function recoverIfPaid(payment) {
  let remote;
  const fullyDeducted = payment.channel === 'health_fund' && payment.amount === 0;
  if (payment.status !== 'succeeded' && !fullyDeducted) {
    try { remote = await wechatPay.queryOrder(payment.outTradeNo); }
    catch (error) { if (error.code !== 'ORDER_NOT_EXIST') throw new Error('微信付款状态暂时无法确认，请稍后重试'); }
  }
  if (payment.status === 'succeeded' || fullyDeducted || remote?.trade_state === 'SUCCESS') {
    await require('./orderSettlement').confirmPayment({ outTradeNo: payment.outTradeNo,
      transactionId: remote?.transaction_id || payment.transactionId,
      paidAt: remote?.success_time ? new Date(remote.success_time) : payment.paidAt,
      snapshot: { source: 'group_action_recovery', tradeState: 'SUCCESS' } });
    return true;
  }
  return false;
}

async function closePayment(payment) {
  try { await wechatPay.closeOrder(payment.outTradeNo); }
  catch (error) { if (error.code !== 'ORDER_NOT_EXIST') throw new Error('原付款未确认关闭，请刷新订单后重试'); }
  payment.status = 'closed'; payment.closedAt = new Date(); await payment.save();
}

async function retryGroupPayment(order, user) {
  return withGroupLock(order, async () => {
    const currentOrder = await Order.findById(order._id);
    if (['closed', 'refunded'].includes(currentOrder?.tradeStatus)) throw new Error('订单已关闭或退款，不能继续支付');
    const payment = await Payment.findOne(paymentOrderQuery(order._id)).sort({ createdAt: -1 });
    if (!payment) throw new Error('支付记录不存在，请联系客服');
    if (await recoverIfPaid(payment)) return { order: await Order.findById(order._id), alreadyPaid: true };
    const rows = paymentAllocations(payment);
    const orders = await Order.find({ _id: { $in: rows.map(row => row.order) }, user: user._id });
    if (orders.length !== rows.length || orders.some(item => ['closed', 'refunded'].includes(item.tradeStatus) || ['paid', 'refunded'].includes(item.paymentStatus))) throw new Error('合并订单状态已变化，请刷新后重试');
    if (!user.wechatMpOpenid) throw new Error('请先绑定当前微信身份后再支付');
    await closePayment(payment);
    const outTradeNo = `JY${Date.now()}${crypto.randomBytes(4).toString('hex')}`;
    const next = await Payment.create({ order: payment.order, allocations: rows, user: user._id,
      channel: 'wechat_pay', status: 'created', amount: payment.amount, outTradeNo });
    await Order.updateMany({ _id: { $in: rows.map(row => row.order) } }, { $set: { paymentId: next._id, paymentOutTradeNo: outTradeNo } });
    try {
      const prepay = await wechatPay.createJsapiPayment({ description: `合并购买${rows.length}件商品`, outTradeNo, amount: payment.amount, openid: user.wechatMpOpenid, attach: String(payment.order) });
      next.prepayId = prepay.prepayId; next.status = 'processing'; await next.save();
      return { order: await Order.findById(order._id), paymentParams: prepay.client, checkoutAmount: payment.amount, orderIds: rows.map(row => row.order) };
    } catch (error) {
      await Payment.updateOne({ _id: next._id, status: { $ne: 'succeeded' } }, { $set: { status: 'processing', failureMessage: error.message } });
      throw new Error('重新发起付款未完成，请刷新订单确认付款状态');
    }
  });
}

async function cancelGroupPayment(order) {
  return withGroupLock(order, async () => {
    const payment = await Payment.findOne(paymentOrderQuery(order._id)).sort({ createdAt: -1 });
    if (!payment) throw new Error('支付记录暂未建立，请稍后刷新订单');
    if (await recoverIfPaid(payment)) throw new Error('微信已确认支付，不能取消，请对所需商品申请退款');
    const rows = paymentAllocations(payment);
    const orders = await Order.find({ _id: { $in: rows.map(row => row.order) }, user: order.user });
    if (orders.length !== rows.length || orders.some(item => ['paid', 'refunded'].includes(item.paymentStatus))) throw new Error('合并订单已支付或退款，请刷新后核对');
    await closePayment(payment);
    for (const item of orders) {
      item.status = 'cancelled'; item.tradeStatus = 'closed'; await item.save();
      await require('./orderInventory').releaseOrderInventory(item);
    }
    return { success: true, message: '本次合并付款的全部待支付订单已取消，可重新选择商品', data: await Order.findById(order._id) };
  });
}

module.exports = { retryGroupPayment, cancelGroupPayment, withGroupLock };
