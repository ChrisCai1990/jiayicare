// Explicit cash receipts only: health-fund/coupon deductions are not cash.
function validateManualOrderPayment(order, paymentMethod, paidAmount) {
  const raw = typeof paidAmount === 'number' || typeof paidAmount === 'string' ? String(paidAmount).trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return { error: '请明确填写实际收款金额，最多保留两位小数' };
  const cashCents = Math.round(Number(raw) * 100);
  const values = [order.servicePrice, order.healthFundAmount ?? 0, order.couponDiscount ?? 0].map(Number);
  if (values.some(value => !Number.isFinite(value) || value < 0)) return { error: '订单金额异常，请先核对订单' };
  const [price, fund, coupon] = values.map(value => Math.round(value * 100));
  if ([price, fund, coupon].some(value => !Number.isSafeInteger(value)) || fund + coupon > price) return { error: '订单抵扣金额异常，请先核对订单' };
  const maximum = Math.max(0, price - fund - coupon);
  if (!Number.isSafeInteger(cashCents) || cashCents > maximum) return { error: '实收金额不能超过扣除健康基金及优惠券后的订单金额' };
  if (paymentMethod === 'healthFund' && (cashCents !== 0 || fund <= 0 || maximum !== 0)) {
    return { error: '健康基金支付仅适用于已全额抵扣的订单，现金实收必须为0；部分抵扣请登记线下实际收款' };
  }
  if (paymentMethod === 'onsite' && cashCents === 0 && maximum > 0) return { error: '尚有待收款金额，不能以0元登记为已支付' };
  return { amount: cashCents / 100 };
}
module.exports = { validateManualOrderPayment };
