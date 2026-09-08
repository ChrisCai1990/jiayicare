const WAIT_DAYS = 7;
const WAIT_MS = WAIT_DAYS * 24 * 60 * 60 * 1000;
function eligibility(order, commission, now = new Date()) {
  if (commission?.role !== 'referrer') {
    const redeemed = commission?.redemptionSequence
      ? order?.redemptions?.some(r => r.sequence === commission.redemptionSequence)
      : order?.status === 'completed' || order?.fulfillmentStatus === 'completed';
    return { ready: !!redeemed, reason: redeemed ? '' : '等待服务完成或对应次数核销', eligibleAt: null };
  }
  const paidAt = order?.paidAt && new Date(order.paidAt);
  if (!paidAt || !Number.isFinite(paidAt.getTime())) return { ready: false, reason: '缺少支付成功时间，需核对支付记录', eligibleAt: null };
  const eligibleAt = new Date(paidAt.getTime() + WAIT_MS);
  const started = !!order.serviceStartedAt || order.status === 'completed' || order.fulfillmentStatus === 'completed'
    || order.fulfillmentStatus === 'in_service' || (order.redemptions || []).some(r => r.redeemedAt);
  const reasons = [];
  if (!started) reasons.push('等待实际服务启动（仅安排人员或预约不算启动）');
  if (now < eligibleAt) reasons.push('等待支付满7天');
  return { ready: !reasons.length, reason: reasons.join('；'), eligibleAt };
}

function adjustedAmount(commission, retainedFraction) {
  const base = Number(commission.originalOrderAmount ?? commission.orderAmount) || 0;
  const original = Number(commission.originalCommissionAmount ?? commission.commissionAmount) || 0;
  const orderAmount = Math.round(base * retainedFraction * 100) / 100;
  const commissionAmount = commission.calculationType === 'fixedAmount' || !commission.commissionRate
    ? Math.min(original, orderAmount) : Math.round(original * retainedFraction * 100) / 100;
  return { orderAmount, commissionAmount };
}
module.exports = { WAIT_DAYS, eligibility, adjustedAmount };
