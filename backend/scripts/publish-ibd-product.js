// Apply the approved commercial terms to the existing Jiayihui IBD draft.
// Default is a read-only preview; pass --apply after code deployment.
require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('../src/models/Tenant');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const standard = require('../src/data/ibdStandardTemplate.json');
const { PRICE, productTerms, validatePublishedProduct } = require('../src/utils/ibdServiceTerms');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const tenant = await Tenant.findOne({ code: 'jiayihui' }).lean();
  if (!tenant) throw new Error('未找到嘉医汇机构');
  const product = await Product.findOne({ tenantId: tenant._id, name: 'IBD 年度专病管理服务' });
  if (!product) throw new Error('未找到 IBD 商品草稿，请先创建');
  const orders = await Order.countDocuments({ serviceId: String(product._id), paymentStatus: 'paid' });
  if (orders) throw new Error('该商品已有已付款订单，请先核对订单快照，不能批量改价或修改服务权益');
  const fields = {
    originalPrice: PRICE, servicePrices: [], memberPrices: {}, skus: [], serviceItems: [],
    specialtyTerms: productTerms(),
    features: ['健康顾问负责', '专科医师决定诊疗', '含 2 次陪诊', '病历与随访管理', 'IBD 日记和趋势图'],
    serviceLocation: '长三角、珠三角（具体医院与陪诊安排由健康顾问确认）',
    validityDays: 365, fulfillmentType: 'subscription_service', bookingRequired: true,
    paymentChannel: 'wechat_pay', healthFundDeduction: { mode: 'disabled', value: 0 },
    serviceWorkflow: { key: 'generic_followup', closureMode: 'planner_review', modules: [],
      notes: 'IBD 年度管理：规划师接单交顾问；顾问对接专科；健管预约、陪诊和日常跟进。按医生个性化方案执行，不批量生成全年任务。' },
    description: [
      '服务期限与价格\n¥2980；支付成功后第 7 天起算，连续管理 12 个月。覆盖长三角和珠三角，共含 2 次陪诊。',
      '服务对象\n克罗恩病、溃疡性结肠炎及未定型结肠炎（IBD-U）客户；病型和当前管理重点由健康顾问依据专科资料核实。',
      `服务概述\n${standard.overview}`,
      `岗位分工\n${standard.roles}`,
      '服务流程\n健康规划师接单和资料收集 → 健康顾问确定医院、科室、专家及就诊目的 → 健管专员预约并安排首次陪诊 → 回收病历、健康顾问审核 → AI 起草随访计划、健康顾问审核 → 健管按个性化方案跟进并反馈顾问 → 依专科意见安排复诊和陪诊 → 年度回顾。',
      `费用边界\n本商品共含 2 次陪诊，覆盖首次就诊与复诊；超出 2 次的陪诊需另行确认服务和费用。${standard.serviceBoundary} 跨城交通、住宿及具体陪诊安排须在购买前确认。`,
      `记录与调整\n${standard.diaryGuide} ${standard.exceptionGuide}`,
      '服务说明\n医院号源及专家出诊可能变化，不承诺特定专家或日期；诊疗和用药调整由专科医师决定。',
    ].join('\n\n'),
    status: 'on',
  };
  const error = validatePublishedProduct({ ...product.toObject(), ...fields });
  if (error) throw new Error(error);
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ productId: String(product._id), currentStatus: product.status,
      proposedStatus: 'on', price: PRICE, terms: fields.specialtyTerms, paidOrders: orders }));
    return;
  }
  Object.assign(product, fields);
  await product.save();
  console.log(JSON.stringify({ productId: String(product._id), status: product.status,
    price: product.originalPrice, terms: product.specialtyTerms }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect().catch(() => {}));
