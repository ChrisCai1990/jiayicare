// Creates two unpublished product drafts for review. Never changes existing products or orders.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Product = require('../src/models/Product');

const tenantId = process.argv.find(value => value.startsWith('--tenant-id='))?.split('=')[1];
const apply = process.argv.includes('--apply');
if (!mongoose.isValidObjectId(tenantId)) throw new Error('Provide --tenant-id=<24-character ID>');

const drafts = [
  {
    name: '单次专家咨询分析', subtitle: '专科专家分析，形成明确的下一步', originalPrice: 899,
    servicePrices: [{ label: '平台匹配专家（约20分钟）', price: 899 }],
    features: ['专科专家约20分钟咨询分析', '健管专员参与并整理资料', '专家书面回复与后续管理路径'],
    description: '适合已有检查、就诊资料，希望向一个专科专家咨询下一步管理方向的客户。\n\n服务流程：提交问题和资料 → 健管专员整理 → 健康顾问撰写转介信 → 健康规划师确认专家与排班 → 专家咨询分析并书面回复 → 健管专员拟随访计划 → 健康顾问审核。\n\n平台根据专业方向和排班匹配专家；可提出基础专家库中的期望人选，最终以排班确认为准。超出基础价格的专家需另行确认报价，不包含在此商品中。服务提供咨询分析，不提供疾病诊断、处方或治疗。线下检查、就诊和治疗费用不包含。腾讯会议自动建会暂未接入，会议方式与链接由工作人员确认。',
    workflowKey: 'expert_consultation',
  },
  {
    name: 'MDT 多学科咨询分析（远程）', subtitle: '多专科意见协调，明确后续管理路径', originalPrice: 1699,
    servicePrices: [{ label: '2位专家（每位约15–20分钟）', price: 1699 }, { label: '3位专家（每位约15–20分钟）', price: 1999 }],
    features: ['2或3位专科专家依次参与', '健康顾问覆盖全程并协调意见', '各专家书面回复和经审核的随访计划'],
    description: '适合涉及多个专科、已有意见需要综合梳理的客户。\n\n服务流程：提交问题和资料 → 健管专员整理 → 健康顾问撰写转介信 → 健康规划师按专家库与排班确认人员 → 多专科咨询 → 专家分别书面回复 → 健康顾问协调相互矛盾的意见 → 健管专员拟随访计划 → 健康顾问审核。\n\n每位专家只参与其约定时段；参与人数以所购规格为准。专家人选受专业方向、排班和服务范围影响。服务提供咨询分析，不提供疾病诊断、处方或治疗；不保证各专家意见一致。线下检查、就诊和治疗费用不包含。腾讯会议自动建会暂未接入，会议方式与链接由工作人员确认。',
    workflowKey: 'mdt_consultation',
  },
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  try {
    const base = await Product.findOne({ tenantId, name: '健康咨询服务' }).select('category').lean();
    if (!base) throw new Error('No existing health consultation product for this tenant');
    for (const draft of drafts) {
      const existing = await Product.findOne({ tenantId, name: draft.name }).select('_id status').lean();
      if (existing) { console.log(JSON.stringify({ name: draft.name, id: String(existing._id), status: existing.status, action: 'unchanged' })); continue; }
      if (!apply) { console.log(JSON.stringify({ name: draft.name, price: draft.originalPrice, category: base.category, action: 'would_create_offline_draft' })); continue; }
      const product = await Product.create({ tenantId, name: draft.name, subtitle: draft.subtitle, originalPrice: draft.originalPrice,
        servicePrices: draft.servicePrices, category: base.category, features: draft.features, description: draft.description,
        status: 'off', fulfillmentType: 'remote_service', bookingRequired: true, deliveryRequired: false,
        serviceProvider: 'jiayihui_health', paymentChannel: 'wechat_pay', validityDays: 90,
        serviceWorkflow: { key: draft.workflowKey, closureMode: 'planner_review', notes: '按专家咨询与 MDT 岗位流转执行；腾讯会议自动建会待后续接入。' } });
      console.log(JSON.stringify({ name: draft.name, id: String(product._id), status: product.status, action: 'created_offline_draft' }));
    }
  } finally { await mongoose.disconnect(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
