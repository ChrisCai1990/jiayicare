/*
 * Uploads the approved posters and idempotently publishes the two consultation
 * products. Run from backend/: node scripts/upsert-new-consultation-products.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const { uploadBase64 } = require('../src/utils/oss');

const assetDir = path.resolve(__dirname, '../../miniprogram/src/assets/service-products');

const catalogue = [
  {
    name: '专家门诊约诊服务',
    subtitle: '指定专家直接协调，或先评估需求再协助约诊',
    poster: 'expert-appointment-consultation.png',
    category: '就医协助',
    sortOrder: 20,
    features: ['专人一对一协调', '两种约诊方式', '进度持续反馈', '就诊事项提醒'],
    originalPrice: Number(process.env.EXPERT_ASSESS_PRICE || 699),
    servicePrices: [
      { label: '指定专家约诊', price: Number(process.env.EXPERT_DIRECT_PRICE || 399) },
      { label: '需求评估约诊', price: Number(process.env.EXPERT_ASSESS_PRICE || 699) },
    ],
    description: `一句话介绍\n客户可指定专家由我们协调安排；尚未确定专家时，也可先评估需求再协助约诊。\n\n服务规格\n【指定专家约诊】适合已经明确医院、科室或专家的客户。客户提交目标专家与就诊时间要求，我们负责核实信息、通过医院公开渠道协调预约、反馈进度并提供就诊提醒。\n【需求评估约诊】适合尚未确定专家的客户。专属顾问先了解病情资料、就诊诉求、城市和时间，评估适合的医院、科室及专家方向；客户确认后，再进入约诊协调。\n\n服务对象\n• 已经选定专家，但自行预约不便或需要持续跟进的人群。\n• 不确定应选择哪家医院、哪个科室或哪位专家的人群。\n• 异地就医、为父母或家人协调专家门诊的人群。\n\n服务流程\n选择服务规格 → 填写约诊需求 → 专人联系 → 资料确认/需求评估 → 协调预约 → 进度反馈 → 就诊提醒\n\n费用说明\n服务费不含医院挂号费、诊疗费、检查费及其他院方或第三方费用。\n\n服务边界\n本服务不提供诊断、治疗或处方，不通过非官方渠道抢号，不承诺具体专家、日期或号源。最终预约结果以医院官方平台及院方确认为准。`,
    refundPolicy: '服务人员尚未开始需求核实或评估前可申请退款；服务启动后，如因客户主动变更或取消，不退已发生的服务费用。具体号源以医院官方平台为准。',
  },
  {
    name: '其他城市服务咨询',
    subtitle: '杭州及长三角以外的服务需求，先咨询、再评估、再安排',
    poster: 'other-city-service-consultation.png',
    category: '服务咨询',
    sortOrder: 21,
    features: ['异地需求受理', '按类型付费咨询', '当地资源评估', '方案单独确认'],
    originalPrice: 98,
    servicePrices: [
      { label: '异地就医协助咨询', price: 1 },
      { label: '异地健康顾问服务咨询', price: 98 },
      { label: '异地营养指导服务咨询', price: 68 },
    ],
    description: `一句话介绍\n不在杭州也可以先咨询，由专属人员根据城市和需求评估可开展的服务方案。\n\n服务规格\n【异地就医协助咨询 ¥1】用于初步了解异地就医需求、目标城市与医院，说明可协助范围和下一步安排；不包含完整约诊、陪诊或代办服务。\n【异地健康顾问服务咨询 ¥98】围绕健康管理目标、既往资料和当地条件，由健康顾问进行一次人工咨询并提出后续服务建议。\n【异地营养指导服务咨询 ¥68】围绕饮食、体重、慢病营养管理等需求，由营养专业人员进行一次人工咨询并提出基础建议。\n\n服务对象\n• 居住地不在杭州或长三角，希望了解嘉医汇异地服务的人群。\n• 有异地就医、健康管理或营养指导需求的人群。\n• 需要为异地父母或家人协调健康服务的人群。\n\n服务流程\n选择咨询类型 → 填写城市与需求 → 完成支付 → 专人联系 → 资源与需求评估 → 沟通可执行方案 → 后续服务另行确认\n\n费用说明\n页面价格仅对应所选咨询服务。后续正式服务、医院收费、交通住宿及当地第三方费用均不包含在咨询费内，需根据确认方案另行报价。\n\n服务边界\n嘉医汇目前以杭州及长三角为重点服务区域，其他城市暂无直营网点。异地服务能否开展、服务方式、周期及费用，以当地资源和最终确认方案为准。`,
    refundPolicy: '咨询人员尚未开始联系前可申请退款；人工咨询开始后，咨询费不予退还。后续正式服务须另行确认和付费。',
  },
];

async function uploadPoster(filename) {
  const buffer = fs.readFileSync(path.join(assetDir, filename));
  return uploadBase64(buffer.toString('base64'), 'image/png', 'service-products');
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  for (const item of catalogue) {
    const { poster, ...product } = item;
    const existing = await Product.findOne({ tenantId: null, name: product.name }).lean();
    const images = existing?.images?.length ? existing.images : [(await uploadPoster(poster)).url];
    await Product.findOneAndUpdate(
      { tenantId: null, name: product.name },
      { $set: { ...product, images, stock: 0, status: 'on', fulfillmentType: 'remote_service', paymentChannel: 'wechat_pay', bookingRequired: true, deliveryRequired: false, serviceLocation: '线上沟通；后续服务地点按确认方案执行', validityDays: 30 } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`已上架：${product.name}`);
  }
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
