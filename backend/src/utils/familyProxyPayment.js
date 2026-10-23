function canClaimFamilyPayment(order, beneficiaryId, payerId) {
  if (!order || String(order.user) !== String(beneficiaryId) || String(beneficiaryId) === String(payerId)) return '订单服务对象不匹配';
  if (order.checkoutGroupId) return '合并订单暂不支持变更付款人，请联系工作人员';
  if (order.status !== 'pending' || order.tradeStatus !== 'awaiting_payment'
    || !['pending', 'unpaid'].includes(order.paymentStatus)) return '该订单已付款、关闭或状态已变化';
  if (order.payerUser && String(order.payerUser) !== String(beneficiaryId)) return '该订单已有其他付款人';
  if (!(Number(order.paymentExpectedAmount) > 0)) return '该订单没有待支付金额';
  if (order.couponId || Number(order.couponDiscount || 0) > 0
    || Number(order.healthFundAmount || 0) > 0 || Number(order.enterpriseSharedFundAmount || 0) > 0) {
    return '该订单已使用服务对象的优惠权益，请联系工作人员重新核价后代付';
  }
  return '';
}

module.exports = { canClaimFamilyPayment };
