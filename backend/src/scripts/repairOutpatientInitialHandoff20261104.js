/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const FollowUpPlan = require('../models/FollowUpPlan');
const FollowUp = require('../models/FollowUp');
const HealthPlan = require('../models/HealthPlan');
const User = require('../models/User');
const { applyOutpatientModules, loadOutpatientModules } = require('../utils/outpatientWorkflowSource');

async function main() {
  const planId = process.argv.find(arg => /^[a-f\d]{24}$/i.test(arg));
  const apply = process.argv.includes('--apply');
  if (!planId || !process.env.MONGODB_URI) throw new Error('需要方案 ID 和 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const plan = await HealthPlan.findById(planId);
    if (!plan || plan.type !== 'medical_assist' || plan.status !== 'active' || !/门诊一站式/.test(`${plan.title || ''} ${plan.content?.templateName || ''}`)) throw new Error('目标不是活动中的门诊一站式方案');
    const patient = await User.findById(plan.patientId).select('tenantId assignedHealthManager assignedFamilyDoctor assignedNutritionist assignedHealthPlanner assignedMedicalAssistant').lean();
    if (!patient?.assignedHealthPlanner) throw new Error('客户尚未分配健康规划师');
    const oldTasks = await FollowUp.collection.find({ sourceHealthPlanId: plan._id }).toArray();
    if (!oldTasks.length || oldTasks.some(task => !['planned', 'cancelled'].includes(task.status))) throw new Error('任务已开始办理或状态不符合修复前提');
    if (oldTasks.some(task => task.workflowKey === 'system:outpatient_initial_assignment')) throw new Error('已存在规划师接收任务');
    const modules = await loadOutpatientModules(Product, FollowUpPlan, patient.tenantId);
    const canonicalIds = new Set(modules.map(item => item.id));
    if (oldTasks.some(task => canonicalIds.has(String(task.workflowKey)))) throw new Error('已存在新版阶段任务，拒绝重复修复');
    const summary = { planId, oldTasks: oldTasks.length, moduleNames: modules.map(item => item.name), plannerId: String(patient.assignedHealthPlanner), apply };
    if (!apply) { console.log(JSON.stringify(summary)); return; }

    const backupKey = `outpatient-planner-handoff-20261104-${planId}-${Date.now()}`;
    await mongoose.connection.db.collection('maintenance_backups').insertOne({ backupKey, reason: 'Replace stale outpatient template tasks with planner-first assignment and current product workflow', createdAt: new Date(), plan: plan.toObject(), tasks: oldTasks });
    plan.content = applyOutpatientModules(plan.content || {}, modules);
    await HealthPlan.collection.updateOne({ _id: plan._id, status: 'active' }, { $set: { content: plan.content, updatedAt: new Date() } });
    await FollowUp.collection.updateMany({ sourceHealthPlanId: plan._id, status: 'planned' }, { $set: { status: 'cancelled', cancelReason: '旧模板节点与当前门诊服务产品流程不一致', updatedAt: new Date() } });

    const route = require('../routes/staff');
    const assignment = await route.ensureOutpatientInitialAssignmentTask(plan, patient);
    let previousGateId = assignment._id;
    for (const [index, module] of modules.entries()) {
      const workflowPlan = await FollowUpPlan.findById(module.id).lean();
      const gate = await route.upsertMedicalAssistModuleTasks(plan, workflowPlan, { patient, dependsOnTaskId: previousGateId, returnGate: true, deferMedicalAssistantAssignment: true, deferInitialAssignment: index === 0 });
      previousGateId = gate?._id;
    }
    await FollowUp.collection.updateMany({ sourceHealthPlanId: plan._id, tenantId: null }, { $set: { tenantId: patient.tenantId } });
    const active = await FollowUp.collection.find({ sourceHealthPlanId: plan._id, status: { $in: ['planned', 'in_progress'] } }, { projection: { workflowKey: 1, taskRole: 1, assignedTo: 1, isBlocked: 1, dependsOnTaskId: 1 } }).toArray();
    if (active.length !== 1 + modules.length * 2 || !active.some(task => task.workflowKey === 'system:outpatient_initial_assignment' && String(task.assignedTo) === String(patient.assignedHealthPlanner) && !task.isBlocked) || !active.some(task => task.workflowKey === modules[0].id && task.taskRole === 'executor' && !task.assignedTo && task.isBlocked)) throw new Error('修复后任务链校验失败，请按备份检查');
    console.log(JSON.stringify({ ...summary, backupKey, activeTasks: active.length }));
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
