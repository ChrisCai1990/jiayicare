const Refund = require('../models/Refund');
const Order = require('../models/Order');
const wechatPay = require('./wechatPay');
const { confirmRefund } = require('./orderSettlement');

async function reconcileRefund(order, source = 'orders_list_query') {
  if (!['requested', 'processing'].includes(order.refundStatus)) return;
  try {
    const refund = await Refund.findOne({ order: order._id }).sort({ createdAt: -1, _id: -1 });
    if (!refund) return;
    // A previous confirmation may have persisted the receipt before saving the order.
    if (refund.status === 'succeeded' && order.refundStatus === 'processing') {
      await confirmRefund(refund, { source, refundStatus: 'SUCCESS' });
      return;
    }
    if (refund.status !== 'processing') return;
    const remote = await wechatPay.queryRefund(refund.outRefundNo);
    if (remote.out_refund_no !== refund.outRefundNo || remote.amount?.refund !== Math.round(refund.amount * 100)) {
      throw new Error('微信退款回执与本地退款单不一致');
    }
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

async function reconcileProcessingOrders() {
  const orders = Order.find({ tradeStatus: 'refund_pending', refundStatus: 'processing' })
    .select('_id refundStatus').lean().cursor();
  for await (const order of orders) await reconcileRefund(order, 'scheduled_refund_query');
}

function startRefundReconciliation() {
  let running = false;
  async function run() {
    if (running) return;
    running = true;
    try {
      await require('./tenantScope').runWithoutTenantScope(reconcileProcessingOrders);
    } catch (error) {
      console.error('[scheduled-refund-query]', error.message);
    } finally { running = false; }
  }
  setTimeout(run, 5000).unref();
  setInterval(run, 60 * 1000).unref();
}

module.exports = { reconcileRefund, startRefundReconciliation };
