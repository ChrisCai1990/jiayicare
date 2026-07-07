const mongoose = require('mongoose');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Commission = require('../models/Commission');

// 支付确认后，按该产品/服务预设的 performanceRule，为转介绍人(referrer)和服务人(fulfiller)
// 各自生成一条独立的待结算 Commission 记录（互不影响，各自角色对应各自的比例或固定金额）。
// 订单需先标记 referrerId/fulfillerId 才能生成对应角色的记录，缺失的一方直接跳过不生成。
async function settleOrderCommission(order) {
  if (!order || order.commissionStatus === 'settled') return { created: [] };

  let performanceRule = null;
  if (order.orderType === 'product' || mongoose.Types.ObjectId.isValid(order.serviceId)) {
    const product = await Product.findById(order.serviceId).catch(() => null);
    if (product) performanceRule = product.performanceRule;
  }
  if (!performanceRule) {
    const service = await Service.findOne({ serviceId: order.serviceId }).catch(() => null);
    if (service) performanceRule = service.performanceRule;
  }
  if (!performanceRule || performanceRule.ruleType === 'none') {
    order.commissionStatus = 'none';
    await order.save();
    return { created: [] };
  }

  const base = order.paidAmount || order.servicePrice || 0;
  const created = [];

  const buildAmount = (role) => {
    if (performanceRule.ruleType === 'percentage') {
      const rate = role === 'referrer' ? performanceRule.referrerRate : performanceRule.fulfillerRate;
      return { amount: Math.round(base * (rate / 100) * 100) / 100, rate: rate / 100 };
    }
    if (performanceRule.ruleType === 'fixedAmount') {
      const amount = role === 'referrer' ? performanceRule.referrerAmount : performanceRule.fulfillerAmount;
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
    const { amount, rate } = buildAmount(role);
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
