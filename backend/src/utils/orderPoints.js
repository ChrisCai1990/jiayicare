// ── 订单消费积分：下单即预记，退款/取消再退回 ──────────────────────
// 之前消费积分挂在超管后台"人工标记已支付"这个动作上，实际业务里这一步经常被跳过，
// 导致用户明明支付过好几笔仍然没有积分记录（2026-07-13 反馈，以金娟为例核实：18笔订单
// paymentStatus 全部是 unpaid，从未有人在后台补标记）。改为下单时按现金实付部分预记积分，
// 不再等待人工确认；订单被取消/退款时，反查这笔预记积分并退回。
const PointsLog = require('../models/PointsLog');
const User = require('../models/User');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const { awardPointsAndConvert } = require('./pointsHealthFund');

// 1元=1积分，仅对现金实付部分（paidAmount，不含健康基金/优惠券抵扣）计分
function pointsForAmount(paidAmount) {
  return Math.floor(Number(paidAmount) || 0);
}

function refundBalanceFields({ awardedPoints, convertedFund, pointsPerYuan }) {
  const awarded = Math.max(0, Math.floor(Number(awardedPoints) || 0));
  const fund = Math.max(0, Number(convertedFund) || 0);
  const rate = Math.max(1, Math.floor(Number(pointsPerYuan) || 100));
  const currentFund = { $max: [0, { $ifNull: ['$healthFundBalance', 0] }] };
  const reversibleFund = { $min: [fund, currentFund] };
  return {
    // The converted bonus may already have been spent on another order. A
    // cancellation must never turn either customer balance negative.
    healthFundBalance: {
      $round: [{ $max: [0, { $subtract: [currentFund, fund] }] }, 2],
    },
    pointsBalance: {
      $max: [0, {
        $subtract: [
          { $add: [{ $max: [0, { $ifNull: ['$pointsBalance', 0] }] }, { $multiply: [reversibleFund, rate] }] },
          awarded,
        ],
      }],
    },
  };
}

// 下单成功后调用：预记本单消费积分（若 paidAmount<=0 则不产生记录）
async function awardOrderPoints(order) {
  const amount = pointsForAmount(order.paidAmount);
  if (amount <= 0) return;
  const alreadyAwarded = await PointsLog.findOne({ refType: 'Order', refId: order._id, source: 'consumption' });
  if (alreadyAwarded) return;
  await awardPointsAndConvert({
    userId: order.user, amount, source: 'consumption',
    refType: 'Order', refId: order._id, remark: `消费订单 ${order.serviceName}`,
  });
}

// 订单取消/退款时调用：反查这笔订单是否预记过消费积分，若有则退回（负数流水 + 扣减余额）
// 幂等：同一笔订单只会退回一次——已存在 redeem 类型的退回记录就不再重复扣
async function refundOrderPoints(order) {
  const awarded = await PointsLog.findOne({ refType: 'Order', refId: order._id, source: 'consumption' });
  if (!awarded) return;
  const alreadyRefunded = await PointsLog.findOne({
    refType: 'Order', refId: order._id, source: 'redeem', remark: /^订单取消\/退款退回/,
  });
  const conversionGrants = await HealthFundTransaction.find({
    userId: order.user, orderId: order._id, type: 'grant', status: 'active',
    remark: /积分自动兑换.*元健康基金/,
  });
  if (alreadyRefunded && conversionGrants.length === 0) return;
  const convertedFund = conversionGrants.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
  const policy = await require('./pointsHealthFund').getPointsPolicy();
  const updatedBefore = await User.findOneAndUpdate(
    { _id: order.user },
    [{ $set: refundBalanceFields({
      awardedPoints: alreadyRefunded ? 0 : awarded.amount,
      convertedFund,
      pointsPerYuan: policy.pointsPerYuan,
    }) }],
    { new: false },
  );
  if (!updatedBefore) throw new Error('订单积分退回失败：用户不存在');
  const reversedFund = Math.min(convertedFund, Math.max(0, Number(updatedBefore.healthFundBalance) || 0));
  const balanceAfter = Math.round(Math.max(0, (Number(updatedBefore.healthFundBalance) || 0) - convertedFund) * 100) / 100;
  const writes = [];
  if (!alreadyRefunded) writes.push(PointsLog.create({
      user: order.user, amount: -awarded.amount, source: 'redeem',
      refType: 'Order', refId: order._id, remark: `订单取消/退款退回：${order.serviceName}`,
  }));
  for (const grant of conversionGrants) {
    grant.status = 'reversed';
    writes.push(grant.save());
    writes.push(HealthFundTransaction.create({
      userId: order.user, orderId: order._id, type: 'reversal', source: grant.source,
      amount: convertedFund > 0 ? -(grant.amount * reversedFund / convertedFund) : 0,
      balanceAfter, reversedTransactionId: grant._id,
      remark: `订单退款撤销积分兑换健康基金：${order.serviceName}`,
    }));
  }
  await Promise.all(writes);
}

module.exports = { pointsForAmount, refundBalanceFields, awardOrderPoints, refundOrderPoints };
