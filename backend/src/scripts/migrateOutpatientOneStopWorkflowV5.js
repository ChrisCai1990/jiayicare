/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCT_NAME = '门诊一站式服务';
const WORKFLOW_PLANS = [
  { name: '门诊一站式：资料收集与核对', executorRole: 'healthManager', executorDueOffsetDays: -10, completionStandard: '已收齐并核对本次就医诉求、病历、既往报告、当前用药及身份医保资料，缺失项已明确。' },
  { name: '门诊一站式：健康顾问评估及医院专家确定', executorRole: 'familyDoctor', executorDueOffsetDays: -9, completionStandard: '健康顾问已完成医学评估分析，确定医院、科室、首次代诊医生及检查后门诊专家。' },
  { name: '门诊一站式：首次代诊开单与约检查', executorRole: 'medicalAssistant', executorDueOffsetDays: -7, completionStandard: '已完成首次代诊，取回门诊病历和检查单，并根据检查单完成检查预约。' },
  { name: '门诊一站式：检查日专家门诊安排', executorRole: 'healthPlanner', executorDueOffsetDays: -3, completionStandard: '已完成检查日专家门诊预约，检查、取结果与门诊时间可衔接。' },
  { name: '门诊一站式：检查及专家门诊陪诊', executorRole: 'medicalAssistant', executorDueOffsetDays: 0, fixedToServiceDate: true, completionStandard: '已陪同客户完成检查和专家门诊，现场医嘱与后续事项已记录。' },
  { name: '门诊一站式：病历检查单上传归档', executorRole: 'medicalAssistant', executorDueOffsetDays: 1, completionStandard: '两次门诊病历、检查单及已取得的检查结果均已上传，本次服务可验收结束。' },
];

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const plans = db.collection('followupplans');
  const product = await products.findOne({ name: PRODUCT_NAME });
  if (!product) throw new Error(`${PRODUCT_NAME}不存在`);
  const backupKey = `outpatient-one-stop-workflow-v5-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Replace single proxy task with the complete outpatient one-stop service workflow', createdAt: new Date(), product });
  const modules = [];
  for (let sequence = 0; sequence < WORKFLOW_PLANS.length; sequence += 1) {
    const row = WORKFLOW_PLANS[sequence];
    const plan = await plans.findOneAndUpdate({ name: row.name }, { $set: {
      ...row, category: 'medical_assist', supervisorRole: 'healthManager', requiresCoordination: true,
      supervisorDueOffsetDays: (row.executorDueOffsetDays || 0) + 1, remindDaysBefore: 1,
      status: 'active', reviewStatus: 'approved', updatedAt: new Date(),
    }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after' });
    modules.push({ planId: plan._id, mode: 'fixed', trigger: '', sequence });
  }
  await products.updateOne({ _id: product._id }, { $set: {
    'serviceWorkflow.key': 'medical_assist', 'serviceWorkflow.modules': modules,
    'serviceWorkflow.followUpPlanIds': modules.map(item => item.planId),
    'serviceWorkflow.followUpPlanId': modules[0].planId,
    'serviceWorkflow.notes': '固定六阶段闭环；病历与检查单上传归档后服务结束。', updatedAt: new Date(),
  } });
  const workflowSnapshot = { key: 'medical_assist', modules, followUpPlanIds: modules.map(item => item.planId), followUpPlanId: modules[0].planId, notes: '固定六阶段闭环；病历与检查单上传归档后服务结束。' };
  const orderResult = await db.collection('orders').updateMany(
    { serviceName: PRODUCT_NAME, status: { $nin: ['completed', 'cancelled', 'refunded'] } },
    { $set: { serviceWorkflowSnapshot: workflowSnapshot, updatedAt: new Date() } }
  );
  const embeddedPlans = modules.map((item, sequence) => ({ id: String(item.planId), name: WORKFLOW_PLANS[sequence].name, mode: 'fixed', trigger: '', sequence, reviewerRole: '' }));
  const planResult = await db.collection('healthplans').updateMany(
    { type: 'medical_assist', status: 'draft', $or: [{ 'content.templateName': PRODUCT_NAME }, { title: /门诊一站式/ }] },
    { $set: {
      'content.followUpPlanId': String(modules[0].planId), 'content.followUpPlanName': WORKFLOW_PLANS[0].name,
      'content.followUpPlans': embeddedPlans, 'content.workflowModules': embeddedPlans,
      'content.workflowModuleDecisions': [], 'content.moduleData.visit.followUpPlanId': String(modules[0].planId),
      'content.moduleData.visit.followUpPlans': embeddedPlans, updatedAt: new Date(),
    } }
  );
  console.log(JSON.stringify({ backupKey, product: PRODUCT_NAME, activeOrdersUpdated: orderResult.modifiedCount, draftPlansUpdated: planResult.modifiedCount, modules: WORKFLOW_PLANS.map(item => item.name) }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { PRODUCT_NAME, WORKFLOW_PLANS };
