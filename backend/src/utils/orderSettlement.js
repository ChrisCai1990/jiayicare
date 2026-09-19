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

  if (payment.allocations?.length) {
    const { paymentAllocations, cents } = require('./checkoutAmounts');
    const allocations = paymentAllocations(payment);
    const token = require('crypto').randomBytes(16).toString('hex');
    const locked = await Payment.findOneAndUpdate({ _id: payment._id,
      $or: [{ settlementLockUntil: null }, { settlementLockUntil: { $lt: new Date() } }],
    }, { $set: { settlementLockUntil: new Date(Date.now() + 300000), settlementLockToken: token } }, { new: true });
    if (!locked) throw new Error('合并付款正在确认，请稍后重试');
    try {
      const orders = [];
      for (const allocation of allocations) {
        const order = await Order.findById(allocation.order);
        if (!order || String(order.user) !== String(payment.user) || cents(order.paymentExpectedAmount) !== cents(allocation.amount)) throw new Error('合并支付订单或金额不一致');
        orders.push(order);
      }
      for (const [index, order] of orders.entries()) {
        await settlePaidOrder(payment, order, allocations[index].amount);
        await Payment.updateOne({ _id: payment._id, settlementLockToken: token }, { $set: { settlementLockUntil: new Date(Date.now() + 300000) } });
      }
      return orders[0];
    } finally {
      await Payment.updateOne({ _id: payment._id, settlementLockToken: token }, { $set: { settlementLockUntil: null, settlementLockToken: '' } });
    }
  }
  return settlePaidOrder(payment, await Order.findById(payment.order), payment.amount);
}

async function settlePaidOrder(payment, order, cashAmount) {
  if (!order) throw new Error('订单不存在');
  // Late/repeated success notifications must never resurrect a refunded child.
  if (order.paymentStatus === 'refunded' || order.refundStatus === 'refunded') return order;

  const wasConfirmedPaid = order.paymentStatus === 'paid';
  order.paymentMethod = payment.channel === 'health_fund' ? 'healthFund' : 'wechat';
  order.paidAmount = cashAmount;
  order.transactionId = payment.transactionId;
  order.paidAt = payment.paidAt;
  order.paymentId = payment._id;
  if (!order.verifyCode) order.verifyCode = require('crypto').randomBytes(4).toString('hex').toUpperCase();
  // 微信确认成功是资金事实，必须先落库，再执行基金、履约、消息等可重试副作用。
  // 这样即使后续任一步骤暂时失败，用户端也不会把已扣款订单显示成待支付。
  order.paymentStatus = 'paid';
  if (!wasConfirmedPaid) {
    order.tradeStatus = 'paid';
    if (order.status === 'cancelled') order.status = 'pending';
  }
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
      { status: 'used', usedAt: new Date(), usedOrderId: order.checkoutGroupId || order._id },
      { new: true },
    );
    if (!used) {
      const alreadyUsed = await Coupon.findOne({ _id: order.couponId, patientId: order.user, status: 'used', usedOrderId: order.checkoutGroupId || order._id });
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

  const medicalReminderWorkflow = require('./medicalReminderWorkflow');
  if (medicalReminderWorkflow.isMedicalReminderOrder(order)) {
    await medicalReminderWorkflow.ensureAdvisorIntakeTask(order);
  } else {
    const plannerId = await resolveHealthPlanner(order.user);
    if (plannerId) {
    const medicationProxy = require('./orderPlannerConversation').isMedicationProxyOrder(order);
    await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id },
      { $setOnInsert: {
        staffId: plannerId,
        assignedTo: plannerId,
        patientId: order.user,
        type: 'other', status: 'planned',
        theme: medicationProxy ? `代配药：AI沟通后由健康规划师确认 · ${order.serviceName}` : `订单服务：${order.serviceName}`,
        content: medicationProxy ? '用户已完成支付，AI健康规划师正在收集药品、数量、配药机构、支付方式和送达日期；请查看本单对话并人工核对后启动代配药流程。' : (order.note || '用户已完成支付，请联系确认服务安排'),
        formData: medicationProxy ? { currentStage: 'ai_communication', medicationProxy: true } : {},
      } },
      { upsert: true, new: true },
    );
    }
  }
  await require('./orderPlannerConversation').ensureOrderPlannerPrompt(order);
  await require('./orderSupplementArchive').ensureOrderSupplementDraft(order);
  await require('./commissionSettlement').settleReferralCommission(order);
  await require('./productShareRewards').grantProductShareRewards(order);
  return order;
}

async function restoreRefundedCoupon(order) {
  if (order.refundStatus !== 'refunded' || !order.couponId) return;
  const retained = order.checkoutGroupId && await Order.findOne({ checkoutGroupId: order.checkoutGroupId, _id: { $ne: order._id }, refundStatus: { $ne: 'refunded' } });
  if (!retained) await Coupon.updateOne(
    { _id: order.couponId, usedOrderId: order.checkoutGroupId || order._id, status: 'used' },
    { status: 'active', usedAt: null, usedOrderId: null },
  );
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
    if (existingOrder?.refundStatus === 'refunded') {
      await require('./commissionLifecycle').cancelOrderCommissions(existingOrder);
      await restoreRefundedCoupon(existingOrder);
      return existingOrder;
    }
  } else {
    refund = claimed;
  }
  const order = await Order.findById(refund.order);
  if (!order) throw new Error('订单不存在');
  const totalRefunded = await require('../models/Refund').aggregate([
    { $match: { order: order._id, status: 'succeeded' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  const amount = Math.round((totalRefunded[0]?.amount || 0) * 100) / 100;
  order.refundedAmount = amount;
  order.refundStatus = amount >= order.paidAmount ? 'refunded' : 'partially_refunded';
  if (order.refundStatus === 'partially_refunded') order.tradeStatus = 'partially_refunded';
  if (order.refundStatus === 'refunded') {
    order.paymentStatus = 'refunded';
    order.tradeStatus = 'refunded';
    if (['pending', 'scheduled'].includes(order.status)) order.status = 'cancelled';
    order.fulfillmentStatus = 'cancelled';
    await Fulfillment.updateOne({ order: order._id }, { status: 'cancelled' });
    await FollowUp.updateMany(
      { sourceType: 'order', sourceOrderId: order._id, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'cancelled', cancelReason: '订单已退款' } },
    );
    await refundOrderPoints(order);
    if (order.healthFundAmount > 0) {
      await require('./healthFundPayment').reverseHealthFund({ order, remark: `订单${order.serviceName}退款返还` });
    }
    await require('./productShareRewards').reverseProductShareRewards(order);
  }
  await order.save();
  // Persist first; concurrent child notifications and retries can then see
  // the last completed refund before returning the shared coupon.
  await restoreRefundedCoupon(order);
  return order;
}

module.exports = { confirmPayment, confirmRefund };
