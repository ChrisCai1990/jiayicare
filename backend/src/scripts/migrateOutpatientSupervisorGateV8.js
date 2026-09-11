/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const plans = await db.collection('healthplans').find({ type: 'medical_assist' }).toArray();
  const outpatientPlanIds = plans.filter(plan => /门诊一站式/.test(`${plan.title || ''} ${plan.content?.templateName || ''}`)).map(plan => plan._id);
  let supervisorsCompleted = 0;
  let tasksUnlocked = 0;
  for (const planId of outpatientPlanIds) {
    const completedExecutors = await db.collection('followups').find({ sourceHealthPlanId: planId, taskRole: 'executor', status: 'completed' }).toArray();
    for (const executor of completedExecutors) {
      const supervisor = await db.collection('followups').findOneAndUpdate(
        { sourceHealthPlanId: planId, taskRole: 'supervisor', workflowKey: executor.workflowKey || '', status: { $in: ['planned', 'in_progress'] } },
        { $set: { status: 'completed', isBlocked: false, serviceChecklist: executor.serviceChecklist || [], completedAt: new Date(), completedBy: 'staff', updatedAt: new Date() } },
        { returnDocument: 'after' }
      );
      if (!supervisor) continue;
      supervisorsCompleted += 1;
      const result = await db.collection('followups').updateMany(
        { sourceHealthPlanId: planId, dependsOnTaskId: supervisor._id, status: 'planned' },
        { $set: { isBlocked: false, activationEvent: '', date: new Date(), remindAt: new Date(), nextFollowUpDate: new Date(), updatedAt: new Date() } }
      );
      tasksUnlocked += result.modifiedCount;
    }
  }
  console.log(JSON.stringify({ outpatientPlans: outpatientPlanIds.length, supervisorsCompleted, tasksUnlocked }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { main };
