// ── 订单消费积分：下单即预记，退款/取消再退回 ──────────────────────
// 之前消费积分挂在超管后台"人工标记已支付"这个动作上，实际业务里这一步经常被跳过，
// 导致用户明明支付过好几笔仍然没有积分记录（2026-07-13 反馈，以金娟为例核实：18笔订单
// paymentStatus 全部是 unpaid，从未有人在后台补标记）。改为下单时按现金实付部分预记积分，
// 不再等待人工确认；订单被取消/退款时，反查这笔预记积分并退回。
const PointsLog = require('../models/PointsLog');
const User = require('../models/User');

// 1元=1积分，仅对现金实付部分（paidAmount，不含健康基金/优惠券抵扣）计分
function pointsForAmount(paidAmount) {
  return Math.floor(Number(paidAmount) || 0);
}

// 下单成功后调用：预记本单消费积分（若 paidAmount<=0 则不产生记录）
async function awardOrderPoints(order) {
  const amount = pointsForAmount(order.paidAmount);
  if (amount <= 0) return;
  await Promise.all([
    User.collection.updateOne({ _id: order.user }, { $inc: { pointsBalance: amount } }),
    PointsLog.create({
      user: order.user, amount, source: 'consumption',
      refType: 'Order', refId: order._id, remark: `消费订单 ${order.serviceName}`,
    }),
  ]);
}

// 订单取消/退款时调用：反查这笔订单是否预记过消费积分，若有则退回（负数流水 + 扣减余额）
// 幂等：同一笔订单只会退回一次——已存在 redeem 类型的退回记录就不再重复扣
async function refundOrderPoints(order) {
  const awarded = await PointsLog.findOne({ refType: 'Order', refId: order._id, source: 'consumption' });
  if (!awarded) return;
  const alreadyRefunded = await PointsLog.findOne({ refType: 'Order', refId: order._id, source: 'redeem' });
  if (alreadyRefunded) return;
  await Promise.all([
    User.collection.updateOne({ _id: order.user }, { $inc: { pointsBalance: -awarded.amount } }),
    PointsLog.create({
      user: order.user, amount: -awarded.amount, source: 'redeem',
      refType: 'Order', refId: order._id, remark: `订单取消/退款退回：${order.serviceName}`,
    }),
  ]);
}

module.exports = { pointsForAmount, awardOrderPoints, refundOrderPoints };
