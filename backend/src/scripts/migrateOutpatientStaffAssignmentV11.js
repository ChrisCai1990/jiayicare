/* eslint-disable no-console */
const mongoose = require('mongoose');
const { main: refreshWorkflow } = require('./migrateOutpatientOneStopWorkflowV5');

async function main() {
  await refreshWorkflow();
  const db = mongoose.connection.db;
  const followUps = db.collection('followups');
  const assignmentPlan = await db.collection('followupplans').findOne({ name: '门诊一站式：执行人员安排', status: 'active' });
  if (!assignmentPlan) throw new Error('门诊一站式执行人员安排模板不存在');

  const healthPlans = await db.collection('healthplans').find({
    type: 'medical_assist', status: 'active',
    $or: [{ 'content.templateName': '门诊一站式服务' }, { title: /门诊一站式/ }],
  }).toArray();
  let created = 0;
  let rewired = 0;
  let skippedWithoutPlanner = 0;
  for (const healthPlan of healthPlans) {
    // 只调整尚未开始的首次代诊；已经办理中的任务不应被迁移脚本撤销负责人或重新加锁。
    const firstVisit = await followUps.findOne({ sourceHealthPlanId: healthPlan._id, taskRole: 'executor', theme: { $regex: '门诊一站式.*首次代诊开检查单' }, status: 'planned' });
    if (!firstVisit) continue;
    const patient = await db.collection('users').findOne({ _id: healthPlan.patientId }, { projection: { assignedHealthPlanner: 1 } });
    const plannerId = patient?.assignedHealthPlanner || healthPlan.content?.supervisorId;
    const planner = plannerId ? await db.collection('admins').findOne({ _id: plannerId, role: 'healthPlanner', staffStatus: 'active' }) : null;
    if (!planner) { skippedWithoutPlanner += 1; continue; }

    const booking = await followUps.findOne({ sourceHealthPlanId: healthPlan._id, taskRole: 'executor', theme: { $regex: '门诊一站式.*代诊约诊服务' } });
    const bookingSupervisor = booking ? await followUps.findOne({ sourceHealthPlanId: healthPlan._id, taskRole: 'supervisor', dependsOnTaskId: booking._id }) : null;
    const previousGate = bookingSupervisor || booking;
    let assignment = await followUps.findOne({ sourceHealthPlanId: healthPlan._id, taskRole: 'executor', workflowKey: String(assignmentPlan._id) });
    if (!assignment) {
      const now = new Date();
      const result = await followUps.insertOne({
        patientId: healthPlan.patientId, staffId: healthPlan.staffId || planner._id, assignedTo: planner._id,
        date: now, type: 'other', status: 'planned', content: '', plannedContent: `完成标准：${assignmentPlan.completionStandard || '分别安排首次代诊和检查日陪诊就医专员'}`,
        executedContent: '', executedType: '', serviceChecklist: [{ key: `workflow_${assignmentPlan._id}`, purpose: assignmentPlan.completionStandard || '' }],
        theme: `执行${assignmentPlan.name} · ${healthPlan.title || ''}`, followUpSchemeId: assignmentPlan._id, formData: null,
        coordinationGroupId: `medical-assist:${healthPlan._id}`, taskRole: 'executor', workflowKey: String(assignmentPlan._id),
        dependsOnTaskId: previousGate?._id || null, isBlocked: !!previousGate && previousGate.status !== 'completed',
        activationEvent: previousGate && previousGate.status !== 'completed' ? 'previous_stage_approved' : '', remindAt: now, nextFollowUpDate: now,
        sourceHealthPlanId: healthPlan._id, sourceType: 'health_plan', completedAt: null, completedBy: null, createdAt: now, updatedAt: now,
      });
      assignment = { _id: result.insertedId };
      created += 1;
    }
    const result = await followUps.updateOne({ _id: firstVisit._id }, { $set: { dependsOnTaskId: assignment._id, isBlocked: true, activationEvent: 'previous_stage_approved', assignedTo: null, updatedAt: new Date() } });
    rewired += result.modifiedCount;
    await followUps.updateMany({ sourceHealthPlanId: healthPlan._id, taskRole: 'executor', theme: { $regex: '门诊一站式.*检查及专家门诊陪诊与归档' }, status: { $in: ['planned', 'in_progress'] } }, { $set: { assignedTo: null, updatedAt: new Date() } });
  }
  console.log(JSON.stringify({ activePlans: healthPlans.length, assignmentTasksCreated: created, firstVisitTasksRewired: rewired, skippedWithoutPlanner }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
