const Refund = require('../models/Refund');
const Order = require('../models/Order');
const wechatPay = require('./wechatPay');
const { confirmRefund } = require('./orderSettlement');

async function reconcileRefund(order, source = 'orders_list_query') {
  if (!['requested', 'processing'].includes(order.refundStatus)) return;
  const refund = await Refund.findOne({ order: order._id, status: { $in: ['requested', 'processing'] } }).sort({ createdAt: -1 });
  if (!refund || refund.status === 'requested') return;
  try {
    const remote = await wechatPay.queryRefund(refund.outRefundNo);
    refund.refundId = remote.refund_id || refund.refundId;
    if (remote.status === 'SUCCESS') {
      await confirmRefund(refund, { source, refundStatus: remote.status });
    } else if (['ABNORMAL', 'CLOSED'].includes(remote.status)) {
      refund.status = remote.status === 'CLOSED' ? 'closed' : 'failed';
      refund.failureMessage = remote.user_received_account || remote.status;
      await refund.save();
      const failedOrder = await Order.findById(refund.order);
      if (failedOrder) {
        require('./orderWorkItem').restoreOrderAfterRefundFailure(failedOrder);
        await failedOrder.save();
        await require('./orderWorkItem').reconcileInactiveOrderWorkItems(failedOrder.user);
      }
    }
  } catch (err) {
    console.error('[orders-refund-query]', err.message);
  }
}

module.exports = { reconcileRefund };
