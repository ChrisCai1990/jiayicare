const Enterprise = require('../models/Enterprise');
const GiftRecord = require('../models/GiftRecord');
const HealthFundTransaction = require('../models/HealthFundTransaction');

async function getCorporateFundAvailable(user) {
  const grants = await GiftRecord.aggregate([
    { $match: { patientId: user._id, giftType: 'fund', fundType: 'enterprise', status: 'active' } },
    { $group: { _id: null, total: { $sum: '$fundAmount' } } },
  ]);
  const spent = await HealthFundTransaction.aggregate([
    { $match: { userId: user._id, source: 'enterprise', status: 'active', type: { $in: ['deduction', 'reversal', 'adjustment'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const ledgerBalance = (grants[0]?.total || 0) + (spent[0]?.total || 0);
  return Math.max(0, Math.min(Number(user.healthFundBalance) || 0, ledgerBalance));
}

async function validateHealthFundDeduction({ user, requested, orderAmount, category }) {
  const amount = Number(requested) || 0;
  if (amount <= 0) return { allowed: 0, enterprise: null };
  if (!user.enterpriseId) throw new Error('当前客户未关联企业，不能使用企业健康基金抵扣');
  const enterprise = await Enterprise.findById(user.enterpriseId);
  const rule = enterprise?.healthFundPaymentRule;
  if (!enterprise || enterprise.status !== 'active' || !rule?.enabled) throw new Error('所属企业尚未启用健康基金支付抵扣');
  if (orderAmount < (Number(rule.minOrderAmount) || 0)) throw new Error(`订单满¥${rule.minOrderAmount}方可使用企业健康基金`);
  if (rule.eligibleCategories?.length && !rule.eligibleCategories.includes(category)) throw new Error('该类服务不在企业健康基金可抵扣范围内');
  const corporateAvailable = await getCorporateFundAvailable(user);
  let ruleLimit = orderAmount;
  if (rule.deductionType === 'percentage') ruleLimit = orderAmount * Math.min(100, Number(rule.deductionValue) || 0) / 100;
  if (rule.deductionType === 'fixedAmount') ruleLimit = Number(rule.deductionValue) || 0;
  const allowed = Math.round(Math.min(orderAmount, corporateAvailable, ruleLimit) * 100) / 100;
  if (amount > allowed) throw new Error(`本单企业健康基金最多可抵扣¥${allowed.toFixed(2)}`);
  return { allowed: amount, enterprise };
}

async function deductHealthFund({ user, enterprise, order, amount }) {
  if (!amount) return null;
  const existing = await HealthFundTransaction.findOne({ orderId: order._id, type: 'deduction', status: 'active' });
  if (existing) return existing;
  const updated = await user.constructor.findOneAndUpdate(
    { _id: user._id, healthFundBalance: { $gte: amount } },
    { $inc: { healthFundBalance: -amount } },
    { new: true },
  );
  if (!updated) throw new Error('健康基金余额发生变化，请刷新后重试');
  return HealthFundTransaction.create({ userId:user._id, enterpriseId:enterprise?._id || null, orderId:order._id, type:'deduction', source:'enterprise', amount:-amount, balanceAfter:updated.healthFundBalance, remark:`订单${order.serviceName}抵扣` });
}

module.exports = { validateHealthFundDeduction, deductHealthFund, getCorporateFundAvailable };
