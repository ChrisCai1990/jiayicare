require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const ProductCategory = require('../src/models/ProductCategory');
const { uploadBuffer } = require('../src/utils/oss');

const CATEGORY = '基因检测服务';
const DISCLAIMER = '本服务属于非医疗级健康检测，仅用于健康管理和生活方式参考，不用于疾病诊断、治疗、遗传病判断或医疗筛查。';

const products = [
  {
    name: '营养代谢基因检测（健康管理版）',
    subtitle: '了解营养代谢特点，辅助制定日常饮食管理方案',
    originalPrice: 699,
    sortOrder: 61,
    features: ['口腔拭子采样', '营养代谢维度', '健康管理报告', '生活方式建议'],
    description: `通过口腔拭子采集样本，分析与常见营养素代谢相关的健康管理维度，并提供便于理解的生活方式建议。${DISCLAIMER}`,
  },
  {
    name: '运动能力基因检测（健康管理版）',
    subtitle: '了解运动相关特点，辅助选择更合适的锻炼方式',
    originalPrice: 599,
    sortOrder: 62,
    features: ['居家采样', '运动特点分析', '恢复管理参考', '运动习惯建议'],
    description: `围绕耐力、力量、运动恢复等非医疗级健康管理维度形成参考报告，帮助用户更科学地安排日常运动。${DISCLAIMER}`,
  },
  {
    name: '体重管理基因检测（健康管理版）',
    subtitle: '从生活方式角度了解体重管理相关个体特点',
    originalPrice: 699,
    sortOrder: 63,
    features: ['口腔拭子采样', '体重管理维度', '饮食运动参考', '健管建议'],
    description: `分析与饮食偏好、能量利用和运动习惯相关的健康管理维度，为长期体重管理提供个体化生活方式参考。${DISCLAIMER}`,
  },
  {
    name: '皮肤抗氧化基因检测（健康管理版）',
    subtitle: '了解皮肤抗氧化与生活方式相关特点',
    originalPrice: 499,
    sortOrder: 64,
    features: ['无创采样', '抗氧化维度', '生活习惯参考', '日常护理建议'],
    description: `围绕抗氧化、日晒反应及日常生活习惯形成非医疗级健康管理参考，帮助用户建立科学的日常护理习惯。${DISCLAIMER}`,
  },
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  await mongoose.connect(process.env.MONGODB_URI);

  let category = await ProductCategory.findOne({ tenantId: null, name: CATEGORY });
  if (!category) category = await ProductCategory.create({ tenantId: null, name: CATEGORY, parent: null, sortOrder: 60 });

  const existing = await Product.findOne({ tenantId: null, name: products[0].name }).lean();
  let imageUrl = existing?.images?.[0] || '';
  if (!imageUrl) {
    const assetPath = path.join(__dirname, 'assets', 'gene-testing-cover.png');
    imageUrl = (await uploadBuffer(fs.readFileSync(assetPath), 'image/png', 'products/gene-testing-demo')).url;
  }

  const results = [];
  for (const product of products) {
    const payload = {
      ...product,
      tenantId: null,
      category: CATEGORY,
      images: [imageUrl],
      servicePrices: [],
      memberPrices: {},
      stock: 999,
      status: 'on',
      fulfillmentType: 'delivery_and_service',
      paymentChannel: 'offline',
      bookingRequired: false,
      deliveryRequired: true,
      serviceLocation: '采样包邮寄到家，按说明完成口腔拭子采样后寄回',
      validityDays: 90,
      refundPolicy: '采样包寄出前可申请退款；采样包寄出或检测服务开始后不支持无理由退款。',
      aiProfile: {
        enabledForRecommendation: false,
        promiseLimits: [DISCLAIMER],
        nextAction: 'inquire',
      },
    };
    const saved = await Product.findOneAndUpdate(
      { tenantId: null, name: product.name },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    results.push({ id: String(saved._id), name: saved.name, status: saved.status });
  }

  console.log(JSON.stringify({ category: { id: String(category._id), name: category.name }, imageUrl, products: results }, null, 2));
}

main()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
