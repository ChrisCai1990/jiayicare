require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

function classify(product) {
  const text = `${product.name} ${product.category}`;
  if (/动态血糖|动态心电|体重管理|代办/.test(text)) return 'delivery_and_service';
  if (/报告解读|营养评估|减重咨询|健康咨询|心理咨询|心理健康陪伴/.test(text)) return 'remote_service';
  if (/年度|计划/.test(text)) return 'subscription_service';
  return 'offline_service';
}

function skuCode(product, index) {
  return `SKU_${product._id.toString().slice(-8).toUpperCase()}_${String(index + 1).padStart(2, '0')}`;
}

function unitsForLabel(label) {
  const match = String(label || '').match(/(\d+)\s*次/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare');
  const products = await Product.find({});
  for (const product of products) {
    const fulfillmentType = classify(product);
    const prices = product.servicePrices?.length
      ? product.servicePrices.map(item => ({ label: item.label, price: item.price }))
      : [{ label: product.name, price: product.originalPrice }];
    product.fulfillmentType = fulfillmentType;
    product.paymentChannel = 'wechat_pay';
    product.deliveryRequired = fulfillmentType === 'delivery_and_service';
    product.bookingRequired = fulfillmentType !== 'digital_content';
    if (!product.skus?.length) {
      product.skus = prices.map((item, index) => ({
        code: skuCode(product, index), label: item.label, price: item.price,
        totalUnits: unitsForLabel(item.label), validityDays: product.validityDays || 365,
        fulfillmentType, active: true,
      }));
    }
    await product.save();
    console.log(`${product.name}: ${fulfillmentType}, ${product.skus.length} SKU`);
  }
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
