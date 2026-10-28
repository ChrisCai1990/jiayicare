const Enterprise = require('../models/Enterprise');
const GiftRecord = require('../models/GiftRecord');
const HealthFundTransaction = require('../models/HealthFundTransaction');
const SystemConfig = require('../models/SystemConfig');
const Product = require('../models/Product');

const DEFAULT_HEALTH_FUND_POLICY = {
  title: '健康基金使用规则', description: '', personalPriority: true,
  personalDeductionType: 'unlimited', personalDeductionValue: 0,
  corporateDeductionType: 'percentage', corporateDeductionValue: 20,
  minOrderAmount: 0, eligibleCategories: [], eligibleProductIds: [], allowCouponStacking: true,
  couponDeductionType: 'unlimited', couponDeductionValue: 0,
  refundToOriginalSource: true,
};

async function getHealthFundPolicy() {
  const cfg = await SystemConfig.findOne({ key: 'healthFundPolicy' }).lean();
  return {
    ...DEFAULT_HEALTH_FUND_POLICY,
    ...(cfg?.value || {}),
    corporateDeductionType: 'percentage',
    corporateDeductionValue: 20,
  };
}

function deductionLimit(type, value, orderAmount) {
  if (type === 'percentage') return orderAmount * Math.min(100, Math.max(0, Number(value) || 0)) / 100;
  if (type === 'fixedAmount') return Math.max(0, Number(value) || 0);
  return orderAmount;
}

function productDeductionLimit(rule, orderAmount) {
  const mode = rule?.mode || 'inherit';
  if (mode === 'disabled') return 0;
  // 保留旧商品的20%额度；显式商品规则不再受平台比例限制。
  if (['inherit', 'unlimited'].includes(mode)) return deductionLimit('percentage', 20, orderAmount);
  return Math.min(orderAmount, deductionLimit(mode, rule?.value, orderAmount));
}

function corporateProductEligible(policy, productId, category, productRule) {
  const mode = productRule?.mode || 'inherit';
  if (mode === 'disabled') return false;
  if (mode !== 'inherit') return true;
  if (policy?.eligibleCategories?.length && !policy.eligibleCategories.includes(category)) return false;
  if (policy?.eligibleProductIds?.length && !policy.eligibleProductIds.map(String).includes(String(productId || ''))) return false;
  return true;
}

function allocateHealthFund({ orderAmount, personalAvailable, vitalityAvailable = 0, corporateAvailable, corporateEligible = true, productRule }) {
  const amount = Math.max(0, Number(orderAmount) || 0);
  const personalUsed = Math.min(amount, Math.max(0, Number(personalAvailable) || 0));
  const vitalityUsed = Math.min(amount - personalUsed, Math.max(0, Number(vitalityAvailable) || 0));
  const remainingAfterUnrestricted = Math.max(0, amount - personalUsed - vitalityUsed);
  const productLimit = productDeductionLimit(productRule, amount);
  const corporateUsed = Math.min(
    remainingAfterUnrestricted,
    Math.max(0, Number(corporateAvailable) || 0),
    corporateEligible ? productLimit : 0,
  );
  return { personalUsed, vitalityUsed, corporateUsed, allowed: Math.round((personalUsed + vitalityUsed + corporateUsed) * 100) / 100 };
}

async function getVitalityFundAvailable(user) {
  const rows = await HealthFundTransaction.aggregate([
    { $match: { userId: user._id, source: 'vitality', status: 'active', type: { $in: ['grant', 'deduction', 'adjustment'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  // 活力基金有明确的来源流水；旧奖励账可能大于实际总余额，不能先让其占满余额。
  return Math.max(0, Math.min(Number(user.healthFundBalance) || 0, rows[0]?.total || 0));
}

async function getCorporateFundAvailable(user) {
  const platformRewardRemarks = [
    '首次使用小程序健康基金奖励', '邀请好友首次使用小程序奖励', '通过好友邀请首次使用小程序奖励',
    '邀请好友完成问卷奖励', '通过好友邀请完成问卷奖励',
  ];
  const [grants, pointsExchangeGrants, legacyFirstLoginGrants, spent] = await Promise.all([GiftRecord.aggregate([
    { $match: { patientId: user._id, giftType: 'fund', status: 'active' } },
    { $group: { _id: null, total: { $sum: '$fundAmount' } } },
  ]), HealthFundTransaction.aggregate([
    // 历史混合积分及新购买积分兑换所得归奖励基金，健康记录积分单独归活力基金。
    // 这类入账没有对应 GiftRecord，需要从健康基金流水单独汇总。
    // 兼容本次规则生效前误记为 promotion 的兑换流水，使既有余额也正确
    // 历史误记为 promotion 的兑换流水也按奖励基金处理。
    { $match: { userId: user._id, type: 'grant', source: { $in: ['enterprise', 'promotion'] }, status: 'active', $or: [
      { remark: /积分自动兑换.*元(健康基金|奖励基金)/ },
      { remark: /^(分享产品成交奖励|通过好友分享购买奖励)/ },
    ] } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]), HealthFundTransaction.aggregate([
    // 1.0.86 之前首登赠金曾误记为 promotion；按明确的业务备注兼容
    // 已发放余额，避免必须先跑数据迁移才能正确展示和抵扣。
    { $match: { userId: user._id, type: 'grant', status: 'active', remark: { $in: platformRewardRemarks } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]), HealthFundTransaction.aggregate([
    { $match: { userId: user._id, source: 'enterprise', status: 'active', type: { $in: ['deduction', 'adjustment'] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ])]);
  const ledgerBalance = (grants[0]?.total || 0) + (pointsExchangeGrants[0]?.total || 0)
    + (legacyFirstLoginGrants[0]?.total || 0) + (spent[0]?.total || 0);
  const vitalityAvailable = await getVitalityFundAvailable(user);
  return Math.max(0, Math.min((Number(user.healthFundBalance) || 0) - vitalityAvailable, ledgerBalance));
}

async function getPersonalFundAvailable(user) {
  const totalBalance = Math.max(0, Number(user.healthFundBalance) || 0);
  const [corporateAvailable, vitalityAvailable] = await Promise.all([getCorporateFundAvailable(user), getVitalityFundAvailable(user)]);
  // 历史余额可能早于分账流水上线。未能在流水中归类的余额按自有基金处理，
  // 避免用户端显示有余额、结算却判定可用额为0。
  return Math.max(0, Math.min(totalBalance, totalBalance - corporateAvailable - vitalityAvailable));
}

async function validateHealthFundDeduction({ user, requested, orderAmount, category, categories, productId, productIds, productLimit, maximize = false }) {
  const amount = Number(requested) || 0;
  if (amount <= 0) return { allowed: 0, enterprise: null };
  const memberEligible = await require('./packageFeatureEntitlements').hasHealthFundAccess(user);
  const policy = await getHealthFundPolicy();
  let productRule = null;
  let finalProductLimit = Number.isFinite(Number(productLimit)) ? Math.max(0, Number(productLimit)) : orderAmount;
  if (productId && productLimit === undefined && require('mongoose').Types.ObjectId.isValid(productId)) {
    const product = await Product.findById(productId).select('healthFundDeduction').lean();
    productRule = product?.healthFundDeduction;
    finalProductLimit = productDeductionLimit(productRule, orderAmount);
  }
  const corporateEligible = corporateProductEligible(policy, productId, category, productRule)
    && orderAmount >= (Number(policy.minOrderAmount) || 0)
    && memberEligible;
  const [personalAvailable, vitalityAvailable] = await Promise.all([getPersonalFundAvailable(user), getVitalityFundAvailable(user)]);
  if (!memberEligible && personalAvailable <= 0 && vitalityAvailable <= 0)
    throw new Error('当前没有可用于本服务的自有或活力基金');
  // 平台发放的首登企业健康基金并不要求用户先绑定某个企业档案。
  const corporateAvailable = await getCorporateFundAvailable(user);
  let enterprise = null;
  let enterpriseEnabled = true;
  if (user.enterpriseId && corporateAvailable > 0) {
    enterprise = await Enterprise.findById(user.enterpriseId);
    const rule = enterprise?.healthFundPaymentRule;
    if (!enterprise || enterprise.status !== 'active') enterpriseEnabled = false;
    else if (rule?.enabled) {
      if (orderAmount < (Number(rule.minOrderAmount) || 0)) enterpriseEnabled = false;
      if (rule.eligibleCategories?.length && !rule.eligibleCategories.includes(category)) enterpriseEnabled = false;
    }
  }
  // 客户端提交的金额只作为抵扣上限，服务端按三类余额实时重算。
  const allocation = allocateHealthFund({
    orderAmount,
    personalAvailable,
    vitalityAvailable,
    corporateAvailable,
    corporateEligible: memberEligible && corporateEligible && enterpriseEnabled,
    productRule: productRule || (productLimit !== undefined && Number.isFinite(finalProductLimit)
      ? { mode: 'fixedAmount', value: finalProductLimit }
      : { mode: 'inherit', value: 0 }),
  });
  // The requested deduction is a ceiling, not the base for the product percentage.
  const allowed = Math.floor(Math.min(maximize ? allocation.allowed : amount, allocation.allowed) * 100 + 1e-7) / 100;
  const personalUsed = Math.min(allocation.personalUsed, allowed);
  const vitalityUsed = Math.min(allocation.vitalityUsed, Math.round((allowed - personalUsed) * 100) / 100);
  const corporateUsed = Math.round((allowed - personalUsed - vitalityUsed) * 100) / 100;
  return { allowed, enterprise, policy, breakdown: { personal: personalUsed, vitality: vitalityUsed, corporate: corporateUsed } };
}

async function deductHealthFund({ user, enterprise, order, amount, breakdown }) {
  amount = Math.round((Number(amount) || 0) * 100) / 100;
  if (!amount) return null;
  const existing = await HealthFundTransaction.find({ orderId: order._id, type: 'deduction', status: 'active' });
  const directStaffDebit = order.initiationSource === 'staff_direct' && /^HF/.test(order.orderNo || '');
  const split = breakdown || { personal: 0, corporate: amount };
  const personalAmount = Math.round((Number(split.personal) || 0) * 100) / 100;
  const vitalityAmount = Math.round((Number(split.vitality) || 0) * 100) / 100;
  const corporateAmount = Math.round((Number(split.corporate) || 0) * 100) / 100;
  if (existing.length && (!directStaffDebit || (personalAmount === 0 || existing.some(row => row.source === 'promotion'))
    && (vitalityAmount === 0 || existing.some(row => row.source === 'vitality'))
    && (corporateAmount === 0 || existing.some(row => row.source === 'enterprise')))) return existing;
  const updated = await user.constructor.findOneAndUpdate(
    // 历史余额可能是 16.59999999999996 这类浮点值；按“分”比较并在扣减后
    // 归一到两位，避免明明显示 ¥16.60 却被判余额不足，阻断支付确认。
    { _id: user._id, healthFundBalance: { $gte: amount - 0.005 },
      ...(directStaffDebit ? { healthFundDirectDebitOrderIds: { $ne: order._id } } : {}) },
    [{ $set: { healthFundBalance: { $round: [{ $subtract: [{ $ifNull: ['$healthFundBalance', 0] }, amount] }, 2] },
      ...(directStaffDebit ? { healthFundDirectDebitOrderIds: { $concatArrays: [{ $ifNull: ['$healthFundDirectDebitOrderIds', []] }, [order._id]] } } : {}) } }],
    { new: true },
  );
  const recovered = !updated && directStaffDebit ? await user.constructor.findById(user._id) : null;
  if (!updated && !recovered?.healthFundDirectDebitOrderIds?.some(id => String(id) === String(order._id)))
    throw new Error('健康基金余额发生变化，请刷新后重试');
  const balanceAfter = (updated || recovered).healthFundBalance;
  const rows = [];
  if (personalAmount > 0 && !existing.some(row => row.source === 'promotion')) rows.push({ userId:user._id, orderId:order._id, type:'deduction', source:'promotion', amount:-personalAmount, balanceAfter, remark:`订单${order.serviceName}自有基金抵扣` });
  if (vitalityAmount > 0 && !existing.some(row => row.source === 'vitality')) rows.push({ userId:user._id, orderId:order._id, type:'deduction', source:'vitality', amount:-vitalityAmount, balanceAfter, remark:`订单${order.serviceName}活力基金抵扣` });
  if (corporateAmount > 0 && !existing.some(row => row.source === 'enterprise')) rows.push({ userId:user._id, enterpriseId:enterprise?._id || null, orderId:order._id, type:'deduction', source:'enterprise', amount:-corporateAmount, balanceAfter, remark:`订单${order.serviceName}奖励基金抵扣` });
  return rows.length ? HealthFundTransaction.insertMany(rows) : existing;
}

async function reverseHealthFund({ order, remark = '订单退款返还' }) {
  if (!order?.healthFundAmount) return 0;
  const deductions = await HealthFundTransaction.find({ orderId: order._id, type: 'deduction', status: 'active' });
  if (!deductions.length) return 0;
  // An order can also have a negative reversal that withdraws health fund
  // converted from awarded points. That is not a refund of the fund used at
  // checkout. Only a reversal linked to one of these deduction rows proves
  // that the checkout deduction has already been returned.
  const alreadyReversed = await HealthFundTransaction.findOne({
    orderId: order._id,
    type: 'reversal',
    status: 'active',
    reversedTransactionId: { $in: deductions.map(item => item._id) },
  });
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

module.exports = { DEFAULT_HEALTH_FUND_POLICY, getHealthFundPolicy, deductionLimit, productDeductionLimit, corporateProductEligible, allocateHealthFund, validateHealthFundDeduction, deductHealthFund, reverseHealthFund, getCorporateFundAvailable, getPersonalFundAvailable, getVitalityFundAvailable };
