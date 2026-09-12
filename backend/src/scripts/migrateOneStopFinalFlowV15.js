/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const { PRODUCT_NAME: OUTPATIENT_PRODUCT, WORKFLOW_PLANS } = require('./migrateOutpatientOneStopWorkflowV5');
const { PRODUCT_NAME: CHECKUP_PRODUCT, TASK_PLAN_DRAFTS } = require('./seedCheckupOneStopWorkflowDraft');

const CHECKUP_NOTE = '健康规划师全程总督办；用户先填写健康文件，健康顾问定制方案，报告解析并经健管审核后由健康顾问完成结果评估和随访计划，最终由健康规划师验收关闭。';
const OUTPATIENT_NOTE = '健康规划师全程总督办；按健管收资料、健康顾问评估、健管约诊、健康规划师安排人员、就医专员代诊开单及陪诊归档流转，最终由健康规划师验收关闭。';

async function upsertPlans(plans, drafts, stripDraft = false, oneStopSupervisor = false) {
  const modules = [];
  for (let sequence = 0; sequence < drafts.length; sequence += 1) {
    const source = drafts[sequence];
    const { key, mode, trigger, sequence: ignoredSequence, ...fields } = source;
    const name = stripDraft ? source.name.replace('【审核稿】', '') : source.name;
    const row = await plans.findOneAndUpdate(
      { name: { $in: [name, source.name] } },
      { $set: {
        ...fields, name,
        category: source.category || 'medical_assist',
        workflowTaskRole: source.workflowTaskRole || 'executor',
        activationEvent: source.activationEvent || '', closesService: !!source.closesService,
        supervisorRole: source.supervisorRole || 'healthPlanner',
        requiresCoordination: oneStopSupervisor ? false : (source.workflowTaskRole === 'supervisor' ? false : source.requiresCoordination !== false),
        status: 'active', reviewStatus: 'approved', reviewedAt: new Date(), updatedAt: new Date(),
      }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' },
    );
    modules.push({ planId: row._id, mode: mode || 'fixed', trigger: trigger || '', sequence });
  }
  return modules;
}

const embeddedModules = (modules, drafts, stripDraft = false) => modules.map((item, sequence) => ({
  id: String(item.planId),
  name: stripDraft ? drafts[sequence].name.replace('【审核稿】', '') : drafts[sequence].name,
  mode: item.mode, trigger: item.trigger, sequence,
  reviewerRole: item.mode === 'conditional' ? 'familyDoctor' : '',
}));

async function run({ apply = false } = {}) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/jiayicare';
  await mongoose.connect(uri);
  try {
    const db = mongoose.connection.db;
    const products = db.collection('products');
    const plans = db.collection('followupplans');
    const healthPlans = db.collection('healthplans');
    const orders = db.collection('orders');
    const followUps = db.collection('followups');
    const [checkup, outpatient] = await Promise.all([
      products.findOne({ name: CHECKUP_PRODUCT }), products.findOne({ name: OUTPATIENT_PRODUCT }),
    ]);
    if (!checkup || !outpatient) throw new Error('体检或门诊一站式产品不存在');
    if (!apply) {
      console.log(JSON.stringify({ mode: 'dry-run', checkupStages: TASK_PLAN_DRAFTS.map(item => item.name), outpatientStages: WORKFLOW_PLANS.map(item => item.name) }, null, 2));
      return;
    }

    const activeServices = await healthPlans.find({ type: 'medical_assist', status: { $in: ['draft', 'active'] }, $or: [
      { 'content.serviceDomain': 'annual_checkup' }, { 'content.templateName': { $in: [CHECKUP_PRODUCT, OUTPATIENT_PRODUCT] } }, { title: /(?:体检|门诊)一站式/ },
    ] }).toArray();
    const activeOrderIds = activeServices.map(item => item.sourceOrderId).filter(Boolean);
    const backupKey = `one-stop-final-flow-v15-${new Date().toISOString()}`;
    await db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Align checkup customer intake and add outpatient final acceptance', createdAt: new Date(), products: [checkup, outpatient], activeServices });

    const checkupModules = await upsertPlans(plans, TASK_PLAN_DRAFTS, true);
    const outpatientModules = await upsertPlans(plans, WORKFLOW_PLANS, false, true);
    const checkupSnapshot = { ...(checkup.serviceWorkflow || {}), key: 'checkup', followUpPlanId: checkupModules[0].planId, followUpPlanIds: checkupModules.map(item => item.planId), modules: checkupModules, notes: CHECKUP_NOTE };
    const outpatientSnapshot = { ...(outpatient.serviceWorkflow || {}), key: 'medical_assist', followUpPlanId: outpatientModules[0].planId, followUpPlanIds: outpatientModules.map(item => item.planId), modules: outpatientModules, notes: OUTPATIENT_NOTE };
    await Promise.all([
      products.updateOne({ _id: checkup._id }, { $set: { serviceWorkflow: checkupSnapshot, updatedAt: new Date() } }),
      products.updateOne({ _id: outpatient._id }, { $set: { serviceWorkflow: outpatientSnapshot, updatedAt: new Date() } }),
      orders.updateMany({ serviceName: CHECKUP_PRODUCT, status: { $nin: ['completed', 'cancelled'] } }, { $set: { serviceWorkflowSnapshot: checkupSnapshot, updatedAt: new Date() } }),
      orders.updateMany({ serviceName: OUTPATIENT_PRODUCT, status: { $nin: ['completed', 'cancelled'] } }, { $set: { serviceWorkflowSnapshot: outpatientSnapshot, updatedAt: new Date() } }),
    ]);

    const outpatientEmbedded = embeddedModules(outpatientModules, WORKFLOW_PLANS);
    let finalTasks = 0;
    for (const service of activeServices) {
      const isCheckup = service.content?.serviceDomain === 'annual_checkup' || /体检一站式/.test(`${service.content?.templateName || ''} ${service.title || ''}`);
      const modules = isCheckup ? embeddedModules(checkupModules, TASK_PLAN_DRAFTS, true) : outpatientEmbedded;
      const snapshot = isCheckup ? checkupSnapshot : outpatientSnapshot;
      await healthPlans.updateOne({ _id: service._id }, { $set: { 'content.followUpPlanId': modules[0].id, 'content.followUpPlans': modules, 'content.workflowModules': modules, 'content.serviceWorkflowSnapshot': snapshot, updatedAt: new Date() } });
      if (isCheckup || !service.pushedAt) continue;
      const finalModule = outpatientModules[outpatientModules.length - 1];
      const finalPlan = WORKFLOW_PLANS[WORKFLOW_PLANS.length - 1];
      const patient = await db.collection('users').findOne({ _id: service.patientId }, { projection: { assignedHealthPlanner: 1 } });
      const assignedTo = service.content?.supervisorId || patient?.assignedHealthPlanner;
      if (!assignedTo) continue;
      const previous = await followUps.findOne({ sourceHealthPlanId: service._id, taskRole: 'executor', theme: /检查及专家门诊陪诊与归档/ });
      const ready = previous?.status === 'completed';
      await followUps.findOneAndUpdate(
        { sourceHealthPlanId: service._id, sourceType: 'health_plan', taskRole: 'supervisor', workflowKey: String(finalModule.planId) },
        { $setOnInsert: { patientId: service.patientId, staffId: service.staffId, assignedTo, sourceHealthPlanId: service._id, sourceType: 'health_plan', followUpSchemeId: finalModule.planId, coordinationGroupId: `medical-assist:${service._id}`, taskRole: 'supervisor', workflowKey: String(finalModule.planId), theme: `总督办${finalPlan.name} · ${service.title || ''}`, plannedContent: finalPlan.completionStandard, status: ready ? 'in_progress' : 'planned', isBlocked: !ready, activationEvent: ready ? '' : 'previous_stage_approved', dependsOnTaskId: previous?._id || null, date: new Date(), remindAt: new Date() } },
        { upsert: true },
      );
      finalTasks += 1;
    }
    console.log(JSON.stringify({ mode: 'applied', backupKey, activeServices: activeServices.length, activeOrderIds: activeOrderIds.length, outpatientModuleCount: outpatientModules.length, finalTasks }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) run({ apply: process.argv.includes('--apply') }).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { run, CHECKUP_NOTE, OUTPATIENT_NOTE };
