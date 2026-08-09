const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Fulfillment = require('../models/Fulfillment');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');
const { awardOrderPoints, refundOrderPoints } = require('./orderPoints');
const { resolveHealthPlanner } = require('./healthPlannerAssignment');

async function confirmPayment({ outTradeNo, transactionId, paidAt, snapshot }) {
  let payment = await Payment.findOneAndUpdate(
    { outTradeNo, status: { $ne: 'succeeded' } },
    { $set: { status: 'succeeded', transactionId: transactionId || '', paidAt: paidAt || new Date(), notifySnapshot: snapshot || null } },
    { new: true },
  );
  if (!payment) {
    payment = await Payment.findOne({ outTradeNo });
    if (!payment) throw new Error('支付单不存在');
  }

  const order = await Order.findById(payment.order);
  if (!order) throw new Error('订单不存在');
  if (order.paymentStatus === 'paid' && order.fulfillmentId) return order;

  order.paymentMethod = 'wechat';
  order.paidAmount = payment.amount;
  order.transactionId = payment.transactionId;
  order.paidAt = payment.paidAt;
  order.paymentId = payment._id;
  if (!order.verifyCode) order.verifyCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
  await order.save();

  if (order.healthFundAmount > 0 && !order.healthFundSettledAt) {
    const enterprise = order.healthFundEnterpriseId ? { _id: order.healthFundEnterpriseId } : null;
    const user = await User.findById(order.user);
    await require('./healthFundPayment').deductHealthFund({ user, enterprise, order, amount: order.healthFundAmount, breakdown: order.healthFundBreakdown });
    order.healthFundSettledAt = new Date();
  }
  if (order.couponId && !order.couponSettledAt) {
    const used = await Coupon.findOneAndUpdate(
      { _id: order.couponId, patientId: order.user, status: 'active' },
      { status: 'used', usedAt: new Date(), usedOrderId: order._id },
      { new: true },
    );
    if (!used) {
      const alreadyUsed = await Coupon.findOne({ _id: order.couponId, patientId: order.user, status: 'used', usedOrderId: order._id });
      if (!alreadyUsed) throw new Error('优惠券状态已变化，请人工核对订单');
    }
    order.couponSettledAt = new Date();
  }
  await order.save();
  await awardOrderPoints(order);

  const fulfillment = await Fulfillment.findOneAndUpdate(
    { order: order._id },
    { $setOnInsert: {
      order: order._id,
      user: order.user,
      type: order.fulfillmentType || 'offline_service',
      status: order.fulfillmentType === 'delivery_and_service' ? 'awaiting_shipment' : 'awaiting_booking',
      note: order.note || '',
    } },
    { upsert: true, new: true },
  );
  order.fulfillmentId = fulfillment._id;
  order.fulfillmentStatus = fulfillment.status;
  await order.save();

  const plannerId = await resolveHealthPlanner(order.user);
  if (plannerId) {
    await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id },
      { $setOnInsert: {
        staffId: plannerId,
        assignedTo: plannerId,
        patientId: order.user,
        type: 'other', status: 'planned',
        theme: `订单服务：${order.serviceName}`,
        content: order.note || '用户已完成支付，请联系确认服务安排',
      } },
      { upsert: true, new: true },
    );
  }
  order.paymentStatus = 'paid';
  order.tradeStatus = 'paid';
  await order.save();
  return order;
}

async function confirmRefund(refund, snapshot) {
  const claimed = await require('../models/Refund').findOneAndUpdate(
    { _id: refund._id, status: { $ne: 'succeeded' } },
    { $set: { status: 'succeeded', succeededAt: new Date(), notifySnapshot: snapshot || null } },
    { new: true },
  );
  if (!claimed) {
    refund = await require('../models/Refund').findById(refund._id);
    if (!refund) throw new Error('退款单不存在');
    const existingOrder = await Order.findById(refund.order);
    if (existingOrder?.refundStatus === 'refunded') return existingOrder;
  } else {
    refund = claimed;
  }
  const order = await Order.findById(refund.order);
  if (!order) throw new Error('订单不存在');
  const totalRefunded = await require('../models/Refund').aggregate([
    { $match: { order: order._id, status: 'succeeded' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  const amount = totalRefunded[0]?.amount || 0;
  order.refundStatus = amount >= order.paidAmount ? 'refunded' : 'partially_refunded';
  if (order.refundStatus === 'refunded') {
    order.paymentStatus = 'refunded';
    order.tradeStatus = 'refunded';
    if (['pending', 'scheduled'].includes(order.status)) order.status = 'cancelled';
    order.fulfillmentStatus = 'cancelled';
    await Fulfillment.updateOne({ order: order._id }, { status: 'cancelled' });
    await refundOrderPoints(order);
    if (order.healthFundAmount > 0) {
      await require('./healthFundPayment').reverseHealthFund({ order, remark: `订单${order.serviceName}退款返还` });
    }
    if (order.couponId) {
      await Coupon.updateOne(
        { _id: order.couponId, usedOrderId: order._id, status: 'used' },
        { status: 'active', usedAt: null, usedOrderId: null },
      );
    }
  }
  await order.save();
  return order;
}

module.exports = { confirmPayment, confirmRefund };
