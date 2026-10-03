const mongoose = require('mongoose');
const Enterprise = require('../models/Enterprise');
const EnterpriseSharedFund = require('../models/EnterpriseSharedFund');
const InsuranceEnrollment = require('../models/InsuranceEnrollment');
const EnterpriseInsurancePolicy = require('../models/EnterpriseInsurancePolicy');
const Product = require('../models/Product');
const { canUseInsuranceCoverage, isDateWithinCoverage } = require('./insuranceCoverage');
const { cents } = require('./checkoutAmounts');

function error(message, status = 409) { return Object.assign(new Error(message), { status }); }
function period(enterprise, year) {
  const data = enterprise?.hrDataByYear?.[String(year)] || {};
  return { startAt: data.healthMgmtStartAt || '', endAt: data.healthMgmtEndAt || '' };
}
function withinPeriod(value, now = new Date()) {
  const start = new Date(value.startAt);
  const end = new Date(value.endAt);
  return !!value.startAt && !!value.endAt && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
    && start <= end && isDateWithinCoverage(value, now);
}
function summary(account, enterprise) {
  if (!account) return null;
  return {
    year: account.year, enabled: account.enabled, ...period(enterprise, account.year),
    policyIds: account.policyIds || [], productIds: account.productIds || [],
    credited: account.creditedCents / 100, available: account.availableCents / 100,
    reserved: account.reservedCents / 100, spent: account.spentCents / 100,
  };
}
async function eligibleAccount(user, productId, now = new Date()) {
  if (!user?.enterpriseId || !mongoose.isValidObjectId(productId)) return null;
  const enterprise = await Enterprise.findOne({ _id: user.enterpriseId, status: 'active' }).lean();
  if (!enterprise) return null;
  const accounts = await EnterpriseSharedFund.find({ enterpriseId: enterprise._id, enabled: true, productIds: productId }).sort({ year: -1 }).lean();
  for (const account of accounts) {
    if (!withinPeriod(period(enterprise, account.year), now) || account.availableCents < 1 || !account.policyIds?.length) continue;
    const enrollments = await InsuranceEnrollment.find({ enterpriseId: enterprise._id, userId: user._id,
      policyId: { $in: account.policyIds }, relation: { $in: ['employee', 'spouse', 'child'] }, status: 'active' }).lean();
    if (!enrollments.length) continue;
    const policies = await EnterpriseInsurancePolicy.find({ _id: { $in: enrollments.map(row => row.policyId) }, enterpriseId: enterprise._id }).lean();
    if (enrollments.some(row => canUseInsuranceCoverage(policies.find(p => String(p._id) === String(row.policyId)), row, now))) return account;
  }
  return null;
}
async function quote(user, productId, afterCoupon) {
  const account = await eligibleAccount(user, productId);
  if (!account) return { amount: 0, account: null };
  const amountCents = Math.min(Math.floor(cents(afterCoupon) / 2), account.availableCents);
  return { amount: amountCents / 100, account };
}
async function reserve({ account, orderId, userId, amount }) {
  const amountCents = cents(amount);
  if (!account || amountCents <= 0) return;
  const key = String(orderId);
  if (!/^[a-f0-9]{24}$/.test(key)) throw error('订单编号无效');
  const path = `entries.${key}`;
  const updated = await EnterpriseSharedFund.findOneAndUpdate({ _id: account._id, enabled: true,
    availableCents: { $gte: amountCents }, [path]: { $exists: false } }, {
    $inc: { availableCents: -amountCents, reservedCents: amountCents },
    $set: { [path]: { orderId: key, userId: String(userId), amountCents, state: 'reserved', at: new Date() } },
  }, { new: true });
  if (updated) return;
  const current = await EnterpriseSharedFund.findById(account._id).lean();
  const existing = current?.entries?.[key];
  if (existing?.state === 'reserved' && existing.amountCents === amountCents) return;
  throw error('企业共享基金余额或规则已变化，请刷新后重新确认');
}
async function settle(order) {
  if (!order?.enterpriseSharedFundAmount) return;
  const amountCents = cents(order.enterpriseSharedFundAmount);
  const path = `entries.${order._id}`;
  const changed = await EnterpriseSharedFund.updateOne({ _id: order.enterpriseSharedFundId,
    [`${path}.state`]: 'reserved', [`${path}.amountCents`]: amountCents }, {
    $inc: { reservedCents: -amountCents, spentCents: amountCents },
    $set: { [`${path}.state`]: 'spent', [`${path}.settledAt`]: new Date() },
  });
  if (changed.modifiedCount) return;
  const account = await EnterpriseSharedFund.findById(order.enterpriseSharedFundId).lean();
  if (account?.entries?.[String(order._id)]?.state !== 'spent') throw error('企业共享基金预留记录异常，请人工核对订单');
}
async function release(order) {
  if (!order?.enterpriseSharedFundAmount) return;
  const amountCents = cents(order.enterpriseSharedFundAmount);
  const path = `entries.${order._id}`;
  await EnterpriseSharedFund.updateOne({ _id: order.enterpriseSharedFundId, [`${path}.state`]: 'reserved',
    [`${path}.amountCents`]: amountCents }, {
    $inc: { reservedCents: -amountCents, availableCents: amountCents },
    $set: { [`${path}.state`]: 'released', [`${path}.releasedAt`]: new Date() },
  });
}
async function refund(order) {
  if (!order?.enterpriseSharedFundAmount) return;
  const amountCents = cents(order.enterpriseSharedFundAmount);
  const path = `entries.${order._id}`;
  const changed = await EnterpriseSharedFund.updateOne({ _id: order.enterpriseSharedFundId, [`${path}.state`]: 'spent',
    [`${path}.amountCents`]: amountCents }, {
    $inc: { spentCents: -amountCents, availableCents: amountCents },
    $set: { [`${path}.state`]: 'refunded', [`${path}.refundedAt`]: new Date() },
  });
  if (changed.modifiedCount) return;
  const account = await EnterpriseSharedFund.findById(order.enterpriseSharedFundId).lean();
  if (account?.entries?.[String(order._id)]?.state !== 'refunded') throw error('企业共享基金退款记录异常，请人工核对订单');
}
async function validateConfiguration(enterpriseId, year, policyIds, productIds) {
  const enterprise = await Enterprise.findById(enterpriseId).lean();
  if (!enterprise) throw error('企业不存在', 404);
  if (!withinPeriod(period(enterprise, year), new Date(period(enterprise, year).startAt || 0))) throw error('请先录入有效的该年度健康管理服务起止日期', 400);
  const policies = await EnterpriseInsurancePolicy.find({ _id: { $in: policyIds }, enterpriseId }).select('_id').lean();
  const products = await Product.find({ _id: { $in: productIds } }).select('_id').lean();
  if (policies.length !== policyIds.length || products.length !== productIds.length) throw error('保险方案或商品不属于当前可配置范围', 400);
  return enterprise;
}

// Repairs interruptions between order persistence and the account's atomic
// transition. Never releases an open order whose WeChat result is still pending.
async function reconcile(account) {
  const Order = require('../models/Order');
  const result = { repaired: 0, unresolved: [] };
  for (const [id, entry] of Object.entries(account.entries || {})) {
    if (!['reserved', 'spent'].includes(entry.state)) continue;
    const order = await Order.findById(id);
    const reference = order || { _id: id, enterpriseSharedFundId: account._id, enterpriseSharedFundAmount: entry.amountCents / 100 };
    if (entry.state === 'reserved' && order?.paymentStatus === 'paid') {
      await settle(reference); result.repaired++; continue;
    }
    if (entry.state === 'reserved' && order?.paymentStatus === 'refunded') {
      await settle(reference); await refund(reference); result.repaired++; continue;
    }
    if (entry.state === 'reserved' && (order?.tradeStatus === 'closed' || order?.status === 'cancelled'
      || (!order && Date.now() - new Date(entry.at).getTime() > 5 * 60 * 1000))) {
      await release(reference); result.repaired++; continue;
    }
    if (entry.state === 'spent' && order?.refundStatus === 'refunded') {
      await refund(reference); result.repaired++; continue;
    }
    if (!order && entry.state === 'spent') result.unresolved.push(id);
  }
  return result;
}
module.exports = { period, withinPeriod, summary, eligibleAccount, quote, reserve, settle, release, refund, validateConfiguration, reconcile };
