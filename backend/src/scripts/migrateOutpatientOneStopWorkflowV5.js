/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCT_NAME = '门诊一站式服务';
const WORKFLOW_PLANS = [
  { name: '门诊一站式：资料收集与核对', executorRole: 'healthManager', executorDueOffsetDays: -10, completionStandard: '已收齐本次就医诉求、病历、既往报告、当前用药及身份医保资料；客户提供的报告已上传归档；资料完整性已审核，缺失项和待补内容已明确。' },
  { name: '门诊一站式：健康顾问评估及医院专家确定', executorRole: 'familyDoctor', executorDueOffsetDays: -9, completionStandard: '健康顾问已完成医学评估分析，确定医院、科室和专家，列明预计涉及的检查单，并明确哪些检查需要专家及对应专家名称。' },
  { name: '门诊一站式：代诊约诊服务', executorRole: 'healthManager', executorDueOffsetDays: -8, completionStandard: '已按健康顾问建议安排代诊所需的约诊服务，并确认开单、特殊检查及检查后专家门诊安排。' },
  { name: '门诊一站式：首次代诊开检查单', executorRole: 'medicalAssistant', executorDueOffsetDays: -7, completionStandard: '已完成首次代诊，按医嘱取得检查单和首次门诊病历，并完整反馈开单结果。' },
  { name: '门诊一站式：检查及专家门诊陪诊与归档', executorRole: 'medicalAssistant', executorDueOffsetDays: 0, fixedToServiceDate: true, completionStandard: '已陪同客户完成检查和专家门诊，两次门诊病历、检查单及已取得结果均已上传归档，本次服务可验收结束。' },
];

async function removeRedundantExpertBookingStage(db, plans) {
  const obsoletePlans = await plans.find({ name: '门诊一站式：检查日专家号预约' }).toArray();
  const obsoletePlanIds = obsoletePlans.map(item => item._id);
  if (!obsoletePlanIds.length) return { cancelled: 0, rewired: 0 };
  await plans.updateMany({ _id: { $in: obsoletePlanIds } }, { $set: { status: 'inactive', updatedAt: new Date() } });

  const followUps = db.collection('followups');
  const obsoleteExecutors = await followUps.find({
    taskRole: 'executor', workflowKey: { $in: obsoletePlanIds.map(String) },
    status: { $in: ['planned', 'in_progress'] },
  }).toArray();
  let rewired = 0;
  for (const executor of obsoleteExecutors) {
    const supervisor = await followUps.findOne({
      sourceHealthPlanId: executor.sourceHealthPlanId,
      taskRole: 'supervisor', workflowKey: executor.workflowKey,
    });
    if (supervisor) {
      const previousGate = executor.dependsOnTaskId
        ? await followUps.findOne({ _id: executor.dependsOnTaskId }, { projection: { status: 1 } })
        : null;
      const unblocked = !executor.dependsOnTaskId || previousGate?.status === 'completed';
      const result = await followUps.updateMany(
        { sourceHealthPlanId: executor.sourceHealthPlanId, dependsOnTaskId: supervisor._id, status: { $in: ['planned', 'in_progress'] } },
        { $set: {
          dependsOnTaskId: executor.dependsOnTaskId || null,
          isBlocked: !unblocked,
          activationEvent: unblocked ? '' : 'previous_stage_approved',
          ...(unblocked ? { date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date() } : {}),
        } }
      );
      rewired += result.modifiedCount;
    }
  }
  const cancelled = await followUps.updateMany(
    { workflowKey: { $in: obsoletePlanIds.map(String) }, status: { $in: ['planned', 'in_progress'] } },
    { $set: { status: 'cancelled', isBlocked: false, cancelReason: '流程优化：专家门诊已在代诊约诊服务中一次性完成预约', updatedAt: new Date() } }
  );
  return { cancelled: cancelled.modifiedCount, rewired };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const plans = db.collection('followupplans');
  await plans.updateMany({ name: '门诊一站式：首次代诊门诊预约' }, { $set: { name: '门诊一站式：代诊约诊服务', updatedAt: new Date() } });
  await db.collection('followups').updateMany(
    { theme: { $regex: '首次代诊门诊预约' } },
    [{ $set: { theme: { $replaceOne: { input: '$theme', find: '首次代诊门诊预约', replacement: '代诊约诊服务' } } } }]
  );
  const obsoleteStageResult = await removeRedundantExpertBookingStage(db, plans);
  const product = await products.findOne({ name: PRODUCT_NAME });
  if (!product) throw new Error(`${PRODUCT_NAME}不存在`);
  const backupKey = `outpatient-one-stop-workflow-v5-${new Date().toISOString()}`;
  await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Replace single proxy task with the complete outpatient one-stop service workflow', createdAt: new Date(), product });
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
  await products.updateOne({ _id: product._id }, { $set: {
    'serviceWorkflow.key': 'medical_assist', 'serviceWorkflow.modules': modules,
    'serviceWorkflow.followUpPlanIds': modules.map(item => item.planId),
    'serviceWorkflow.followUpPlanId': modules[0].planId,
    'serviceWorkflow.notes': '固定五阶段闭环；预约一次性完成，代诊开单后直接进入陪诊归档。', updatedAt: new Date(),
  } });
  const workflowSnapshot = { key: 'medical_assist', modules, followUpPlanIds: modules.map(item => item.planId), followUpPlanId: modules[0].planId, notes: '固定五阶段闭环；预约一次性完成，代诊开单后直接进入陪诊归档。' };
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
  console.log(JSON.stringify({ backupKey, product: PRODUCT_NAME, activeOrdersUpdated: orderResult.modifiedCount, draftPlansUpdated: planResult.modifiedCount, obsoleteStageResult, modules: WORKFLOW_PLANS.map(item => item.name) }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { PRODUCT_NAME, WORKFLOW_PLANS };
