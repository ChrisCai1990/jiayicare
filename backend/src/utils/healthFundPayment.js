const Enterprise = require('../models/Enterprise');
const GiftRecord = require('../models/GiftRecord');
const HealthFundTransaction = require('../models/HealthFundTransaction');

async function getCorporateFundAvailable(user) {
  const grants = await GiftRecord.aggregate([
    { $match: { patientId: user._id, giftType: 'fund', fundType: 'enterprise', status: 'active' } },
    { $group: { _id: null, total: { $sum: '$fundAmount' } } },
  ]);
  const spent = await HealthFundTransaction.aggregate([
    { $match: { userId: user._id, source: 'enterprise', status: 'active', type: { $in: ['deduction', 'adjustment'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const ledgerBalance = (grants[0]?.total || 0) + (spent[0]?.total || 0);
  return Math.max(0, Math.min(Number(user.healthFundBalance) || 0, ledgerBalance));
}

async function getPersonalFundAvailable(user) {
  const grants = await GiftRecord.aggregate([
    { $match: { patientId: user._id, giftType: 'fund', fundType: { $in: ['promotion', 'other'] }, status: 'active' } },
    { $group: { _id: null, total: { $sum: '$fundAmount' } } },
  ]);
  const deductions = await HealthFundTransaction.aggregate([
    { $match: { userId: user._id, source: { $in: ['promotion', 'other'] }, status: 'active', type: 'deduction' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return Math.max(0, Math.min(Number(user.healthFundBalance) || 0, (grants[0]?.total || 0) + (deductions[0]?.total || 0)));
}

async function validateHealthFundDeduction({ user, requested, orderAmount, category }) {
  const amount = Number(requested) || 0;
  if (amount <= 0) return { allowed: 0, enterprise: null };
  const personalAvailable = await getPersonalFundAvailable(user);
  const personalUsed = Math.min(amount, orderAmount, personalAvailable);
  const corporateRequested = Math.max(0, amount - personalUsed);
  let enterprise = null;
  let corporateUsed = 0;
  if (corporateRequested > 0) {
    if (!user.enterpriseId) throw new Error(`自有健康基金本单最多可抵扣¥${personalUsed.toFixed(2)}`);
    enterprise = await Enterprise.findById(user.enterpriseId);
    const rule = enterprise?.healthFundPaymentRule;
    if (!enterprise || enterprise.status !== 'active' || !rule?.enabled) throw new Error(`自有健康基金本单最多可抵扣¥${personalUsed.toFixed(2)}；企业基金尚未启用`);
    if (orderAmount < (Number(rule.minOrderAmount) || 0)) throw new Error(`订单满¥${rule.minOrderAmount}方可使用企业健康基金`);
    if (rule.eligibleCategories?.length && !rule.eligibleCategories.includes(category)) throw new Error('该类服务不在企业健康基金可抵扣范围内');
    const corporateAvailable = await getCorporateFundAvailable(user);
    let ruleLimit = orderAmount;
    if (rule.deductionType === 'percentage') ruleLimit = orderAmount * Math.min(100, Number(rule.deductionValue) || 0) / 100;
    if (rule.deductionType === 'fixedAmount') ruleLimit = Number(rule.deductionValue) || 0;
    corporateUsed = Math.min(corporateRequested, corporateAvailable, ruleLimit, orderAmount - personalUsed);
    if (corporateRequested > corporateUsed) throw new Error(`本单健康基金最多可抵扣¥${(personalUsed + corporateUsed).toFixed(2)}`);
  }
  return { allowed: amount, enterprise, breakdown: { personal: personalUsed, corporate: corporateUsed } };
}

async function deductHealthFund({ user, enterprise, order, amount, breakdown }) {
  if (!amount) return null;
  const existing = await HealthFundTransaction.find({ orderId: order._id, type: 'deduction', status: 'active' });
  if (existing.length) return existing;
  const updated = await user.constructor.findOneAndUpdate(
    { _id: user._id, healthFundBalance: { $gte: amount } },
    { $inc: { healthFundBalance: -amount } },
    { new: true },
  );
  if (!updated) throw new Error('健康基金余额发生变化，请刷新后重试');
  const split = breakdown || { personal: 0, corporate: amount };
  const rows = [];
  if (split.personal > 0) rows.push({ userId:user._id, orderId:order._id, type:'deduction', source:'promotion', amount:-split.personal, balanceAfter:updated.healthFundBalance, remark:`订单${order.serviceName}自有基金抵扣` });
  if (split.corporate > 0) rows.push({ userId:user._id, enterpriseId:enterprise?._id || null, orderId:order._id, type:'deduction', source:'enterprise', amount:-split.corporate, balanceAfter:updated.healthFundBalance, remark:`订单${order.serviceName}企业基金抵扣` });
  return HealthFundTransaction.insertMany(rows);
}

async function reverseHealthFund({ order, remark = '订单退款返还' }) {
  if (!order?.healthFundAmount) return 0;
  const deductions = await HealthFundTransaction.find({ orderId: order._id, type: 'deduction', status: 'active' });
  if (!deductions.length) return 0;
  const alreadyReversed = await HealthFundTransaction.findOne({ orderId: order._id, type: 'reversal', status: 'active' });
  if (alreadyReversed) return 0;

  const amount = deductions.reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0);
  if (amount <= 0) return 0;
  const User = require('../models/User');
  const updated = await User.findByIdAndUpdate(order.user, { $inc: { healthFundBalance: amount } }, { new: true });
  if (!updated) throw new Error('健康基金返还失败：用户不存在');
  await HealthFundTransaction.insertMany(deductions.map(deduction => ({
    userId: order.user,
    enterpriseId: deduction.enterpriseId,
    orderId: order._id,
    type: 'reversal',
    source: deduction.source,
    amount: Math.abs(deduction.amount),
    balanceAfter: updated.healthFundBalance,
    reversedTransactionId: deduction._id,
    remark,
  })));
  await HealthFundTransaction.updateMany(
    { _id: { $in: deductions.map(item => item._id) }, status: 'active' },
    { status: 'reversed' },
  );
  return amount;
}

module.exports = { validateHealthFundDeduction, deductHealthFund, reverseHealthFund, getCorporateFundAvailable, getPersonalFundAvailable };
