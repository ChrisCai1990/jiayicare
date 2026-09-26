/* eslint-disable no-console */
// 创建/更新 365 会员专享就医协助服务包草稿。默认仅写入未上架商品，
// 不影响既有订单、客户权益或已经售卖的服务价格。
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

const NAMES = {
  errand: '医务代办服务', proxy: '医疗代诊服务', companion: '就医陪同服务', expert: '专家约诊服务',
};
const BUNDLE_NAME = '365会员专享就医协助自选服务包（草稿）';

function upsertPrice(rows, label, price) {
  const list = Array.isArray(rows) ? rows.map(item => ({ label: item.label, price: Number(item.price) })) : [];
  const index = list.findIndex(item => item.label === label);
  if (index >= 0) list[index] = { label, price };
  else list.push({ label, price });
  return list;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const products = await Product.find({ name: { $in: Object.values(NAMES) } });
  const byName = new Map(products.map(item => [item.name, item]));
  const missing = Object.values(NAMES).filter(name => !byName.has(name));
  if (missing.length) throw new Error(`缺少商城服务：${missing.join('、')}`);

  const errand = byName.get(NAMES.errand);
  errand.servicePrices = upsertPrice(errand.servicePrices, '医务代办服务', 280);
  await errand.save();

  const expert = byName.get(NAMES.expert);
  expert.servicePrices = upsertPrice(expert.servicePrices, '内部协调专家约诊', 268);
  expert.servicePrices = upsertPrice(expert.servicePrices, '外部协调专家约诊', 568);
  await expert.save();

  const option = (product, specificationLabel, pricingGroup) => ({
    selectionKey: `${product._id}:${specificationLabel || 'default'}`,
    productId: product._id, specificationLabel, pricingGroup,
  });
  const draft = {
    name: BUNDLE_NAME,
    subtitle: '365会员专享 · 3项自选 · 两年有效 · 剩余权益可一次转赠',
    images: ['/api/uploads/member-medical-assist-bundle.png'],
    originalPrice: 1217,
    servicePrices: [], category: '就医协助服务', sortOrder: 20,
    features: ['365会员专享', '3项服务自由组合', '两年有效', '剩余权益可一次转赠'],
    description: '从医务代办、代诊、常规/复杂陪诊、内部/外部专家约诊中选择3项。服务包已享会员组合价，不能叠加健康基金或优惠券；每一项服务独立核销，有效期两年。',
    stock: 0, stockLimited: false, status: 'off', fulfillmentType: 'subscription_service', paymentChannel: 'wechat_pay',
    bookingRequired: false, deliveryRequired: false, validityDays: 730, healthFundDeduction: { mode: 'disabled', value: 0 },
    refundPolicy: '服务包购买后未使用可申请退款；已使用的服务按商城对应服务标准价结算后退还剩余金额。',
    memberBundle: {
      enabled: true, allowedMembershipTiers: ['consumer365', 'annual', 'therapy', 'enterprise'],
      selectionCount: 3, validityDays: 730, purchaseLimitPerMembership: 1, transferRemainingOnce: true,
      discountRules: [
        { key: 'low_cost', label: '代办/代诊/内部约诊（65折）', discountRate: 0.65 },
        { key: 'high_cost', label: '陪诊/外部约诊（7折）', discountRate: 0.7 },
      ],
      selectableProducts: [
        option(errand, '医务代办服务', 'low_cost'),
        option(byName.get(NAMES.proxy), '单次代诊服务', 'low_cost'),
        option(byName.get(NAMES.companion), '简单陪同（4小时）', 'high_cost'),
        option(byName.get(NAMES.companion), '复杂陪同（4小时）', 'high_cost'),
        option(expert, '内部协调专家约诊', 'low_cost'),
        option(expert, '外部协调专家约诊', 'high_cost'),
      ],
    },
  };
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'dry-run', draft: { name: draft.name, status: draft.status, memberBundle: draft.memberBundle } }, null, 2));
    return;
  }
  const result = await Product.findOneAndUpdate({ name: BUNDLE_NAME }, { $set: draft }, { new: true, upsert: true, setDefaultsOnInsert: true });
  console.log(JSON.stringify({ applied: true, productId: String(result._id), name: result.name, status: result.status }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
