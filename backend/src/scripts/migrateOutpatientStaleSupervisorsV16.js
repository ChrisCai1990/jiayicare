/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const followUps = db.collection('followups');
  const plans = await db.collection('healthplans').find({
    type: 'medical_assist',
    $or: [{ 'content.templateName': '门诊一站式服务' }, { title: /门诊一站式/ }],
  }).project({ _id: 1 }).toArray();
  let staleSupervisorsCompleted = 0;
  for (const plan of plans) {
    const supervisors = await followUps.find({
      sourceHealthPlanId: plan._id,
      taskRole: 'supervisor',
      status: { $in: ['planned', 'in_progress', 'missed'] },
      dependsOnTaskId: { $ne: null },
    }).project({ _id: 1, dependsOnTaskId: 1 }).toArray();
    for (const supervisor of supervisors) {
      const dependency = await followUps.findOne({ _id: supervisor.dependsOnTaskId }, { projection: { status: 1, completedAt: 1 } });
      if (dependency?.status !== 'completed') continue;
      const result = await followUps.updateOne(
        { _id: supervisor._id, status: { $in: ['planned', 'in_progress', 'missed'] } },
        { $set: { status: 'completed', isBlocked: false, completedAt: dependency.completedAt || new Date(), completedBy: 'staff', updatedAt: new Date() } }
      );
      staleSupervisorsCompleted += result.modifiedCount;
    }
  }
  console.log(JSON.stringify({ outpatientPlans: plans.length, staleSupervisorsCompleted }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
