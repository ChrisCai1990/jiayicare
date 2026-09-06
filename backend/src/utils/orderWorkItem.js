const ACTIVE_ORDER_TRADE_STATUSES = ['paid', 'fulfilling', 'partially_refunded'];
const ACTIVE_ORDER_REFUND_STATUSES = ['', 'none', 'failed', 'partially_refunded'];

function activeOrderWorkItemQuery() {
  return {
    paymentStatus: 'paid',
    tradeStatus: { $in: ACTIVE_ORDER_TRADE_STATUSES },
    refundStatus: { $in: [...ACTIVE_ORDER_REFUND_STATUSES, null] },
    status: { $in: ['pending', 'scheduled'] },
  };
}

module.exports = {
  ACTIVE_ORDER_TRADE_STATUSES,
  ACTIVE_ORDER_REFUND_STATUSES,
  activeOrderWorkItemQuery,
};
