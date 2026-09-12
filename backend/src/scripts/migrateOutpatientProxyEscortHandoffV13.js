/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const followUps = db.collection('followups');
  const plans = await db.collection('healthplans').find({
    type: 'medical_assist', status: 'active',
    $or: [{ 'content.templateName': '门诊一站式服务' }, { title: /门诊一站式/ }],
  }).project({ _id: 1 }).toArray();
  let supervisorsCompleted = 0;
  let escortTasksUnlocked = 0;
  let missingEscortAssignment = 0;
  for (const plan of plans) {
    const firstVisit = await followUps.findOne({
      sourceHealthPlanId: plan._id, taskRole: 'executor', status: 'completed',
      theme: { $regex: '门诊一站式.*首次代诊开检查单' },
    }, { sort: { completedAt: -1, updatedAt: -1 } });
    if (!firstVisit) continue;
    const assignment = await followUps.findOne({
      sourceHealthPlanId: plan._id, taskRole: 'executor', status: 'completed',
      theme: { $regex: '门诊一站式.*执行人员安排' },
    }, { sort: { completedAt: -1, updatedAt: -1 } });
    const escortStaffId = assignment?.formData?.escortStaffId;
    if (!escortStaffId) { missingEscortAssignment += 1; continue; }
    const supervisorMatch = [
      firstVisit.workflowKey ? { workflowKey: firstVisit.workflowKey } : null,
      { dependsOnTaskId: firstVisit._id },
    ].filter(Boolean);
    const supervisor = await followUps.findOneAndUpdate(
      { sourceHealthPlanId: plan._id, taskRole: 'supervisor', status: { $in: ['planned', 'in_progress'] }, $or: supervisorMatch },
      { $set: { status: 'completed', isBlocked: false, serviceChecklist: firstVisit.serviceChecklist || [], formData: firstVisit.formData || null, completedAt: new Date(), completedBy: 'staff', updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (supervisor) supervisorsCompleted += 1;
    const result = await followUps.updateMany(
      { sourceHealthPlanId: plan._id, taskRole: 'executor', theme: { $regex: '门诊一站式.*检查及专家门诊陪诊与归档' }, status: { $in: ['planned', 'in_progress'] } },
      { $set: { assignedTo: escortStaffId, isBlocked: false, activationEvent: '', date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(), formData: { handoffSnapshot: firstVisit.formData || {} }, updatedAt: new Date() } }
    );
    escortTasksUnlocked += result.modifiedCount;
  }
  console.log(JSON.stringify({ outpatientPlans: plans.length, supervisorsCompleted, escortTasksUnlocked, missingEscortAssignment }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
