/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const followUps = db.collection('followups');
  const completedReviews = await followUps.find({
    sourceType: 'health_plan',
    taskRole: 'executor',
    status: 'completed',
    workflowKey: 'system:outpatient_post_visit_review',
  }).project({ sourceHealthPlanId: 1, completedAt: 1, completedBy: 1 }).toArray();
  let plansCompleted = 0;
  let supervisorTasksCompleted = 0;
  for (const review of completedReviews) {
    if (!review.sourceHealthPlanId) continue;
    const completedAt = review.completedAt || new Date();
    const supervisorResult = await followUps.updateMany(
      {
        sourceHealthPlanId: review.sourceHealthPlanId,
        taskRole: 'supervisor',
        status: { $nin: ['completed', 'cancelled'] },
      },
      { $set: { status: 'completed', isBlocked: false, completedAt, completedBy: 'staff', updatedAt: new Date() } }
    );
    supervisorTasksCompleted += supervisorResult.modifiedCount;
    const planResult = await db.collection('healthplans').updateOne(
      { _id: review.sourceHealthPlanId, type: 'medical_assist', status: { $ne: 'completed' } },
      { $set: { status: 'completed', 'content.workflowCompletedAt': completedAt, 'content.workflowCompletedBy': review.completedBy || null, updatedAt: new Date() } }
    );
    plansCompleted += planResult.modifiedCount;
  }
  console.log(JSON.stringify({ completedReviews: completedReviews.length, plansCompleted, supervisorTasksCompleted }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
