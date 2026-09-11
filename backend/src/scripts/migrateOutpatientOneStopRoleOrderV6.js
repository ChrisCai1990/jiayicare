/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const { PRODUCT_NAME, WORKFLOW_PLANS } = require('./migrateOutpatientOneStopWorkflowV5');
const { TEMPLATE_NORMALIZATION, normalizedContent } = require('./normalizeMedicalAssistTemplates');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const plans = db.collection('followupplans');
  const product = await products.findOne({ name: PRODUCT_NAME });
  if (!product) throw new Error(`${PRODUCT_NAME}不存在`);
  const backupKey = `outpatient-one-stop-role-order-v6-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Put health-manager document collection before family-doctor assessment and clarify single-service positioning', createdAt: new Date(), product });

  const modules = [];
  for (let sequence = 0; sequence < WORKFLOW_PLANS.length; sequence += 1) {
    const row = WORKFLOW_PLANS[sequence];
    const plan = await plans.findOneAndUpdate({ name: row.name }, { $set: {
      ...row, category: 'medical_assist', supervisorRole: 'healthPlanner', requiresCoordination: true,
      supervisorDueOffsetDays: (row.executorDueOffsetDays || 0) + 1, remindDaysBefore: 1,
      status: 'active', reviewStatus: 'approved', updatedAt: new Date(),
    }, $setOnInsert: { createdAt: new Date() } }, { upsert: true, returnDocument: 'after' });
    modules.push({ planId: plan._id, mode: 'fixed', trigger: '', sequence });
  }
  await plans.updateMany({ name: { $in: ['门诊一站式：健康顾问评估', '门诊一站式：医院及专家筛选', '门诊一站式：首次代诊开单与约检查', '门诊一站式：检查日专家门诊安排', '门诊一站式：检查及专家门诊陪诊', '门诊一站式：病历检查单上传归档'] } }, { $set: { status: 'inactive', updatedAt: new Date() } });
  await plans.updateMany({ category: 'medical_assist', status: 'active' }, { $set: { supervisorRole: 'healthPlanner', requiresCoordination: true, updatedAt: new Date() } });
  const checkupOneStop = await products.findOne({ name: '体检一站式服务' });
  const checkupPlanIds = (checkupOneStop?.serviceWorkflow?.modules || []).map(item => item.planId).filter(Boolean);
  if (checkupPlanIds.length) await plans.updateMany({ _id: { $in: checkupPlanIds } }, { $set: { supervisorRole: 'healthPlanner', requiresCoordination: true, updatedAt: new Date() } });
  const notes = '主要面向单次服务客户；健康规划师总督办，按健管收集资料、健康顾问评估、一次性完成预约、代诊开单、陪诊归档顺序流转。';
  const workflowSnapshot = { key: 'medical_assist', modules, followUpPlanIds: modules.map(item => item.planId), followUpPlanId: modules[0].planId, notes };
  const aiProfile = {
    ...(product.aiProfile || {}),
    targetNeeds: ['资料收集与健康顾问评估', '首次代诊开单与检查预约', '检查日专家门诊及陪诊'],
    suitableFor: ['需要一次性完成评估、开单、检查和专家门诊闭环的单次服务客户'],
    notSuitableFor: ['仅需健康顾问评估的年度会员', '已有明确检查单且只需代约检查', '仅需单次代诊或陪诊'],
    operatorNotes: '门诊一站式主要按单次服务销售；年度会员已有健康顾问评估权益，通常按需另选代办、代诊或陪诊。',
  };
  await products.updateOne({ _id: product._id }, { $set: { serviceWorkflow: workflowSnapshot, aiProfile, updatedAt: new Date() } });
  const orderResult = await db.collection('orders').updateMany(
    { serviceName: PRODUCT_NAME, status: { $nin: ['completed', 'cancelled', 'refunded'] } },
    { $set: { serviceWorkflowSnapshot: workflowSnapshot, updatedAt: new Date() } }
  );
  const embeddedPlans = modules.map((item, sequence) => ({ id: String(item.planId), name: WORKFLOW_PLANS[sequence].name, mode: 'fixed', trigger: '', sequence, reviewerRole: '' }));
  const planResult = await db.collection('healthplans').updateMany(
    { type: 'medical_assist', status: 'draft', $or: [{ 'content.templateName': PRODUCT_NAME }, { title: /门诊一站式/ }] },
    { $set: {
      'content.followUpPlanId': String(modules[0].planId), 'content.followUpPlanName': WORKFLOW_PLANS[0].name,
      'content.followUpPlans': embeddedPlans, 'content.workflowModules': embeddedPlans, 'content.workflowModuleDecisions': [],
      'content.moduleData.visit.followUpPlanId': String(modules[0].planId), 'content.moduleData.visit.followUpPlans': embeddedPlans,
      updatedAt: new Date(),
    } }
  );
  const openMedicalPlans = await db.collection('healthplans').find({ type: 'medical_assist', status: { $in: ['draft', 'active'] } }, { projection: { patientId: 1 } }).toArray();
  for (const healthPlan of openMedicalPlans) {
    const patient = await db.collection('users').findOne({ _id: healthPlan.patientId }, { projection: { assignedHealthPlanner: 1 } });
    if (patient?.assignedHealthPlanner) await db.collection('healthplans').updateOne({ _id: healthPlan._id }, { $set: { 'content.supervisorId': patient.assignedHealthPlanner, 'content.moduleData.visit.supervisorId': patient.assignedHealthPlanner, updatedAt: new Date() } });
  }
  const templateRule = TEMPLATE_NORMALIZATION[PRODUCT_NAME];
  const template = await db.collection('plantemplates').findOne({ name: PRODUCT_NAME, type: 'medical_assist' });
  if (template) await db.collection('plantemplates').updateOne({ _id: template._id }, { $set: { content: normalizedContent(template.content, templateRule), updatedAt: new Date() } });
  console.log(JSON.stringify({ backupKey, activeOrdersUpdated: orderResult.modifiedCount, draftPlansUpdated: planResult.modifiedCount, modules: WORKFLOW_PLANS.map(item => `${item.executorRole}:${item.name}`) }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { WORKFLOW_PLANS };
