const Enterprise = require('../models/Enterprise');
const GiftRecord = require('../models/GiftRecord');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const SystemConfig = require('../models/SystemConfig');

const DEFAULT_HEALTH_FUND_POLICY = {
  title: '健康基金使用规则', description: '', personalPriority: true,
  personalDeductionType: 'unlimited', personalDeductionValue: 0,
  corporateDeductionType: 'fixedAmount', corporateDeductionValue: 200,
  minOrderAmount: 0, eligibleCategories: [], eligibleProductIds: [], allowCouponStacking: true,
  couponDeductionType: 'unlimited', couponDeductionValue: 0,
  refundToOriginalSource: true,
};

async function getHealthFundPolicy() {
  const cfg = await SystemConfig.findOne({ key: 'healthFundPolicy' }).lean();
  return { ...DEFAULT_HEALTH_FUND_POLICY, ...(cfg?.value || {}) };
}

function deductionLimit(type, value, orderAmount) {
  if (type === 'percentage') return orderAmount * Math.min(100, Math.max(0, Number(value) || 0)) / 100;
  if (type === 'fixedAmount') return Math.max(0, Number(value) || 0);
  return orderAmount;
}

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
  const totalBalance = Math.max(0, Number(user.healthFundBalance) || 0);
  const recordedPersonal = Math.max(0, (grants[0]?.total || 0) + (deductions[0]?.total || 0));
  const corporateAvailable = await getCorporateFundAvailable(user);
  // 历史余额可能早于分账流水上线。未能在流水中归类的余额按自有基金处理，
  // 避免用户端显示有余额、结算却判定可用额为0。
  return Math.max(0, Math.min(totalBalance, Math.max(recordedPersonal, totalBalance - corporateAvailable)));
}

async function validateHealthFundDeduction({ user, requested, orderAmount, category, productId }) {
  const amount = Number(requested) || 0;
  if (amount <= 0) return { allowed: 0, enterprise: null };
  const policy = await getHealthFundPolicy();
  if (orderAmount < (Number(policy.minOrderAmount) || 0)) throw new Error(`订单满¥${policy.minOrderAmount}方可使用健康基金`);
  if (policy.eligibleCategories?.length && !policy.eligibleCategories.includes(category)) throw new Error('该类服务不在健康基金可抵扣范围内');
  if (policy.eligibleProductIds?.length && !policy.eligibleProductIds.map(String).includes(String(productId || ''))) throw new Error('该服务不在健康基金可抵扣范围内');
  const personalAvailable = await getPersonalFundAvailable(user);
  const personalLimit = deductionLimit(policy.personalDeductionType, policy.personalDeductionValue, orderAmount);
  const corporateAvailable = user.enterpriseId ? await getCorporateFundAvailable(user) : 0;
  let enterprise = null;
  let corporateLimit = deductionLimit(policy.corporateDeductionType, policy.corporateDeductionValue, orderAmount);
  if (user.enterpriseId && corporateAvailable > 0) {
    enterprise = await Enterprise.findById(user.enterpriseId);
    const rule = enterprise?.healthFundPaymentRule;
    if (!enterprise || enterprise.status !== 'active') corporateLimit = 0;
    else if (rule?.enabled) {
      if (orderAmount < (Number(rule.minOrderAmount) || 0)) corporateLimit = 0;
      if (rule.eligibleCategories?.length && !rule.eligibleCategories.includes(category)) corporateLimit = 0;
      // 单笔抵扣额度以平台“健康基金管理”的统一规则为准；企业规则只控制
      // 是否启用、最低金额和适用分类，避免旧企业固定额度覆盖平台新比例。
    }
  }
  let remaining = Math.min(amount, orderAmount);
  let personalUsed = 0; let corporateUsed = 0;
  const takePersonal = () => { const used=Math.min(remaining, personalAvailable, personalLimit); personalUsed=used; remaining-=used; };
  const takeCorporate = () => { const used=Math.min(remaining, corporateAvailable, corporateLimit); corporateUsed=used; remaining-=used; };
  if (policy.personalPriority !== false) { takePersonal(); takeCorporate(); } else { takeCorporate(); takePersonal(); }
  if (remaining > 0) throw new Error(`本单健康基金最多可抵扣¥${(amount - remaining).toFixed(2)}`);
  return { allowed: amount, enterprise, policy, breakdown: { personal: personalUsed, corporate: corporateUsed } };
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

module.exports = { DEFAULT_HEALTH_FUND_POLICY, getHealthFundPolicy, deductionLimit, validateHealthFundDeduction, deductHealthFund, reverseHealthFund, getCorporateFundAvailable, getPersonalFundAvailable };
