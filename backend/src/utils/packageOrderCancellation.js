const Order = require('../models/Order');
const Fulfillment = require('../models/Fulfillment');
const FollowUp = require('../models/FollowUp');
const PackageEntitlement = require('../models/PackageEntitlement');
const { withGroupLock } = require('./groupPaymentActions');
const packageServiceRedemption = require('./packageServiceRedemption');

function packageCancellationBlock(order, fulfillment) {
  if (!order?.packageEntitlementUsage?.entitlementId) return '该订单未使用套餐权益';
  if (Number(order.paidAmount || 0) > 0 || Number(order.healthFundAmount || 0) > 0
    || Number(order.enterpriseSharedFundAmount || 0) > 0 || order.paymentId || order.checkoutGroupId) {
    return '该订单还涉及实际付款，请联系工作人员核对';
  }
  if (order.status !== 'pending' || order.tradeStatus !== 'paid' || order.paymentStatus !== 'paid'
    || !['', 'none', 'failed'].includes(order.refundStatus || '')) return '订单状态已变化，请刷新后重试';
  if (order.serviceStartedAt || Number(order.usedUnits || 0) > 0
    || (fulfillment && !['pending_assignment', 'awaiting_booking'].includes(fulfillment.status))) {
    return '服务已安排或开始，请联系服务负责人核对后取消';
  }
  return '';
}

async function cancelPackageCoveredOrder(originalOrder) {
  return withGroupLock(originalOrder, async () => {
    const order = await Order.findById(originalOrder._id);
    const fulfillment = await Fulfillment.findOne({ order: originalOrder._id });
    const blocked = packageCancellationBlock(order, fulfillment);
    if (blocked) throw new Error(blocked);
    const usage = order.packageEntitlementUsage;
    const reserved = await PackageEntitlement.findOne({ _id: usage.entitlementId,
      usageRecords: { $elemMatch: { executionOrderId: order._id, status: 'reserved' } } }).select('_id');
    if (!reserved) throw new Error('套餐权益状态待核对，请联系服务负责人');
    const cancelled = await Order.findOneAndUpdate({ _id: order._id, status: 'pending', tradeStatus: 'paid',
      paymentStatus: 'paid', serviceStartedAt: null, usedUnits: 0,
      'packageEntitlementUsage.entitlementId': usage.entitlementId },
    { $set: { status: 'cancelled', tradeStatus: 'closed', fulfillmentStatus: 'cancelled', supervisionStatus: 'cancelled' } },
    { new: true });
    if (!cancelled) throw new Error('订单状态已变化，请刷新后重试');
    const restored = await packageServiceRedemption.settleReservedPackageOrder(cancelled);
    await Fulfillment.updateOne({ order: order._id, status: { $in: ['pending_assignment', 'awaiting_booking'] } },
      { $set: { status: 'cancelled' } });
    await FollowUp.updateMany({ sourceType: 'order', sourceOrderId: order._id,
      status: { $nin: ['completed', 'cancelled'] } },
    { $set: { status: 'cancelled', cancelReason: '套餐权益订单已取消' } });
    if (restored.status !== 'cancelled') {
      console.error('[package-order-cancel] entitlement restoration needs review', String(order._id), restored.status);
      return { success: true, data: cancelled, message: '订单已取消，套餐权益恢复待工作人员核对' };
    }
    return { success: true, data: cancelled, message: '订单已取消，本次占用的套餐权益已恢复' };
  });
}

module.exports = { packageCancellationBlock, cancelPackageCoveredOrder };
