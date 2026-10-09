// Idempotent, unpublished catalogue draft. Run only for the Jiayihui tenant.
// The draft stays unpublished until the order and escort workflow is verified.
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const Product = require('../src/models/Product');
const ProductCategory = require('../src/models/ProductCategory');
const standard = require('../src/data/ibdStandardTemplate.json');
const { PRICE, productTerms } = require('../src/utils/ibdServiceTerms');

const NAME = 'IBD 年度专病管理服务';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ code: 'jiayihui' }).lean();
  if (!tenant) throw new Error('未找到嘉医汇机构，未创建商品');
  const tenantId = tenant._id;
  const category = await ProductCategory.findOneAndUpdate(
    { tenantId, name: '专病管理' },
    { $setOnInsert: { tenantId, name: '专病管理', parent: null, sortOrder: 70 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const existing = await Product.findOne({ tenantId, name: NAME }).lean();
  if (existing) {
    console.log(JSON.stringify({ categoryId: String(category._id), productId: String(existing._id), status: existing.status, created: false }));
    return;
  }
  const description = [
    '服务对象\n克罗恩病、溃疡性结肠炎及未定型结肠炎（IBD-U）客户；病型和当前管理重点由健康顾问依据专科资料核实。',
    `服务概述\n${standard.overview}`,
    `岗位分工\n${standard.roles}`,
    '服务流程\n健康规划师接单和资料收集 → 健康顾问确定医院、科室、专家及就诊目的 → 健管专员预约并安排首次陪诊 → 回收病历、健康顾问审核 → AI 起草随访计划、健康顾问审核 → 健管按个性化方案跟进并反馈顾问 → 依专科意见安排复诊和陪诊 → 年度回顾。',
    `服务范围与费用\n售价 ¥${PRICE}，服务自支付成功后第 7 天起算，连续管理 12 个月，覆盖长三角和珠三角。服务期共含 2 次陪诊，可用于首次及复诊；超出 2 次的陪诊另行确认服务和费用。${standard.serviceBoundary.replace('首次及后续复诊陪诊包含在服务内；', '')} 跨城交通、住宿及具体陪诊安排须购买前确认。`,
    `记录与调整\n${standard.diaryGuide} ${standard.exceptionGuide}`,
    '服务说明\n服务期为一年。医院号源及专家出诊可能变化，不承诺特定专家或日期；诊疗调整由专科医师决定。',
  ].join('\n\n');
  const product = await Product.create({
    tenantId, name: NAME, subtitle: '健康顾问负责制 · 专科协作 · 1 年院外管理',
    category: '专病管理', originalPrice: PRICE, servicePrices: [], memberPrices: {},
    sortOrder: 70, stock: 0, stockLimited: false, status: 'off',
    features: ['健康顾问负责', '专科医师决定诊疗', '含 2 次陪诊', '病历与随访管理', 'IBD 日记和趋势图'],
    description, fulfillmentType: 'subscription_service', paymentChannel: 'wechat_pay',
    bookingRequired: true, deliveryRequired: false, validityDays: 365,
    serviceLocation: '长三角、珠三角（具体医院与陪诊安排由健康顾问确认）',
    specialtyTerms: productTerms(),
    refundPolicy: '服务开始前可申请退款；服务开始后的退费根据已实际提供服务、陪诊安排及双方确认的服务协议核算。医院诊疗与检查费用由客户向院方另付。',
    healthFundDeduction: { mode: 'disabled', value: 0 },
    aiProfile: { enabledForRecommendation: false },
  });
  console.log(JSON.stringify({ categoryId: String(category._id), productId: String(product._id), status: product.status, created: true }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
