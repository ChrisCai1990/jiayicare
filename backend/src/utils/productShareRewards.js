const ProductShare = require('../models/ProductShare');
const SystemConfig = require('../models/SystemConfig');
const User = require('../models/User');
const HealthFundTransaction = require('../models/HealthFundTransaction');

async function policy() {
  const row = await SystemConfig.findOne({ key: 'healthFundPolicy' }).lean();
  return { enabled: false, sharerAmount: 0, recipientAmount: 0, ...(row?.value || {}) };
}

async function grantOne(userId, amount, order, remark) {
  if (!(amount > 0)) return;
  const user = await User.findByIdAndUpdate(userId, { $inc: { healthFundBalance: amount } }, { new: true });
  await HealthFundTransaction.create({ userId, orderId: order._id, type: 'grant', source: 'promotion', amount, balanceAfter: user?.healthFundBalance || 0, remark });
}

async function grantProductShareRewards(order) {
  const share = await ProductShare.findOne({ convertedOrderId: order._id, sharerType: 'customer', rewardStatus: 'pending' });
  if (!share) return;
  const cfg = await policy();
  if (!cfg.enabled || !share.sharerUserId || !share.recipientUserId || String(share.sharerUserId) === String(share.recipientUserId)) return;
  await grantOne(share.sharerUserId, Number(cfg.sharerAmount || 0), order, `分享产品成交奖励：${order.serviceName}`);
  await grantOne(share.recipientUserId, Number(cfg.recipientAmount || 0), order, `通过好友分享购买奖励：${order.serviceName}`);
  share.rewardStatus = 'granted';
  await share.save();
}

async function reverseProductShareRewards(order) {
  const share = await ProductShare.findOne({ convertedOrderId: order._id, rewardStatus: 'granted' });
  if (!share) return;
  const txs = await HealthFundTransaction.find({ orderId: order._id, source: 'promotion', type: 'grant', status: 'active' });
  for (const tx of txs) {
    const user = await User.findByIdAndUpdate(tx.userId, { $inc: { healthFundBalance: -tx.amount } }, { new: true });
    tx.status = 'reversed';
    await tx.save();
    await HealthFundTransaction.create({ userId: tx.userId, orderId: order._id, type: 'reversal', source: 'promotion', amount: -tx.amount, balanceAfter: user?.healthFundBalance || 0, reversedTransactionId: tx._id, remark: `订单退款撤销分享奖励：${order.serviceName}` });
  }
  share.rewardStatus = 'reversed';
  await share.save();
}

module.exports = { grantProductShareRewards, reverseProductShareRewards };
