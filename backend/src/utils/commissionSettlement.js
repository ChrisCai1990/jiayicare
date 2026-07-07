const mongoose = require('mongoose');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Commission = require('../models/Commission');
const Admin = require('../models/Admin');

// 支付确认后，按该产品/服务预设的 performanceRule，为转介绍人(referrer)和服务人(fulfiller)
// 各自生成一条独立的待结算 Commission 记录（互不影响，各自角色对应各自的比例或固定金额）。
// 订单需先标记 referrerId/fulfillerId 才能生成对应角色的记录，缺失的一方直接跳过不生成。
//
// 2026-07-07 新增：员工个人比例优先——同岗位不同人可能有不同的绩效比例（如基础薪酬高的人绩效
// 比例相应调低），Admin.personalPerformanceRule 有配置(ruleType!=='none')时优先于产品全局比例，
// 该员工没有个人设置时才退回产品的 performanceRule。referrer 和 fulfiller 各自独立判断，
// 因为两人可能一个有个人设置一个没有。
async function settleOrderCommission(order) {
  if (!order || order.commissionStatus === 'settled') return { created: [] };

  let productRule = null;
  if (order.orderType === 'product' || mongoose.Types.ObjectId.isValid(order.serviceId)) {
    const product = await Product.findById(order.serviceId).catch(() => null);
    if (product) productRule = product.performanceRule;
  }
  if (!productRule) {
    const service = await Service.findOne({ serviceId: order.serviceId }).catch(() => null);
    if (service) productRule = service.performanceRule;
  }

  const base = order.paidAmount || order.servicePrice || 0;
  const created = [];

  const buildAmount = (role, rule) => {
    if (!rule || rule.ruleType === 'none') return { amount: 0, rate: 0 };
    if (rule.ruleType === 'percentage') {
      const rate = role === 'referrer' ? rule.referrerRate : rule.fulfillerRate;
      return { amount: Math.round(base * (rate / 100) * 100) / 100, rate: rate / 100 };
    }
    if (rule.ruleType === 'fixedAmount') {
      const amount = role === 'referrer' ? rule.referrerAmount : rule.fulfillerAmount;
      return { amount, rate: 0 };
    }
    return { amount: 0, rate: 0 };
  };

  const roles = [
    { role: 'referrer', staffId: order.referrerId },
    { role: 'fulfiller', staffId: order.fulfillerId },
  ];

  for (const { role, staffId } of roles) {
    if (!staffId) continue;
    // 该员工有个人比例设置(ruleType!=='none')就用个人的，否则退回产品全局比例
    const staff = await Admin.findById(staffId).select('personalPerformanceRule').catch(() => null);
    const personalRule = staff?.personalPerformanceRule;
    const effectiveRule = (personalRule && personalRule.ruleType !== 'none') ? personalRule : productRule;
    const { amount, rate } = buildAmount(role, effectiveRule);
    if (!amount || amount <= 0) continue;
    const commission = await Commission.create({
      staffId, role, tenantId: order.tenantId, patientId: order.user, orderId: order._id,
      orderAmount: base, commissionRate: rate, commissionAmount: amount,
      status: 'pending', productName: order.serviceName, productType: order.orderType,
    });
    created.push(commission);
  }

  order.commissionStatus = created.length ? 'pending' : 'none';
  await order.save();
  return { created };
}

module.exports = { settleOrderCommission };
