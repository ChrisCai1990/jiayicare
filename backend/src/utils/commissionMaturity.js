const { eligibility, adjustedAmount } = require('./commissionEligibility');

async function refreshOrderCommissions(order) {
  if (!order?._id) return;
  const Commission = require('../models/Commission');
  const { cancellationReason, cancelOrderCommissions } = require('./commissionLifecycle');
  if (cancellationReason(order)) return cancelOrderCommissions(order);
  const rows = await Commission.find({ orderId: order._id, status: { $in: ['estimated', 'pending', 'confirmed', 'paid'] } });
  if (!rows.length) return;
  const Refund = require('../models/Refund');
  const refunds = await Refund.find({ order: order._id, status: { $in: ['succeeded', 'requested', 'processing'] } }).select('amount status');
  const refunded = refunds.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const refundHold = refunds.some(r => ['requested', 'processing'].includes(r.status)) || ['requested', 'processing'].includes(order.refundStatus);
  const missingRefundLedger = order.refundStatus === 'partially_refunded' && !refunded;
  const originalPaid = Number(order.paidAmount || order.paymentExpectedAmount || order.servicePrice || 0);
  const fraction = originalPaid > 0 ? Math.max(0, 1 - refunded / originalPaid) : 1;
  for (const row of rows) {
    const adjusted = adjustedAmount(row, fraction);
    if (row.status === 'paid') {
      if (refunded > 0) await Commission.updateOne({ _id: row._id, status: 'paid' }, { $set: { reversalRequired: true, cancellationReason: '订单部分退款，已打款佣金需差额核对' } });
      continue;
    }
    const gate = eligibility(order, row);
    const reason = refundHold ? '退款处理中，佣金暂不可审核或打款' : missingRefundLedger ? '部分退款金额缺少成功流水，需核对' : order.paymentStatus !== 'paid' ? '等待有效支付' : gate.reason;
    const changed = adjusted.commissionAmount !== row.commissionAmount;
    const status = reason ? 'estimated' : row.status === 'confirmed' && !changed ? 'confirmed' : 'pending';
    await Commission.updateOne({ _id: row._id, status: row.status, updatedAt: row.updatedAt }, { $set: {
      originalOrderAmount: row.originalOrderAmount ?? row.orderAmount,
      originalCommissionAmount: row.originalCommissionAmount ?? row.commissionAmount,
      ...adjusted, status, eligibilityReason: reason, eligibleAt: gate.eligibleAt, refundedAmount: refunded,
    } });
  }
}

async function refreshCommissions(filter = {}) {
  const Commission = require('../models/Commission');
  const Order = require('../models/Order');
  const ids = await Commission.distinct('orderId', { ...filter, status: { $in: ['estimated', 'pending', 'confirmed'] } });
  for (const id of ids) {
    const order = await Order.findById(id);
    if (order) await refreshOrderCommissions(order);
  }
}
function startCommissionScheduler() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await require('./tenantScope').runWithoutTenantScope(() => refreshCommissions()); }
    catch (e) { console.error('[commission-maturity]', e.message); }
    finally { running = false; }
  };
  setTimeout(run, 5000).unref();
  setInterval(run, 60 * 60 * 1000).unref();
}
module.exports = { refreshOrderCommissions, refreshCommissions, startCommissionScheduler };
