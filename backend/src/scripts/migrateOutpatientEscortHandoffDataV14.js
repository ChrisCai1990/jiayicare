/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const followUps = mongoose.connection.db.collection('followups');
  const escorts = await followUps.find({
    taskRole: 'executor',
    status: { $in: ['planned', 'in_progress'] },
    theme: { $regex: '门诊一站式.*检查及专家门诊陪诊与归档' },
  }).project({ _id: 1, sourceHealthPlanId: 1, formData: 1 }).toArray();
  let repaired = 0;
  for (const escort of escorts) {
    if (escort.formData?.handoffSnapshot) continue;
    const proxyVisit = await followUps.findOne({
      sourceHealthPlanId: escort.sourceHealthPlanId,
      taskRole: 'executor',
      status: 'completed',
      theme: { $regex: '门诊一站式.*首次代诊开检查单' },
    }, { sort: { completedAt: -1, updatedAt: -1 } });
    if (!proxyVisit?.formData) continue;
    const result = await followUps.updateOne(
      { _id: escort._id },
      { $set: { formData: { ...(escort.formData || {}), handoffSnapshot: proxyVisit.formData }, updatedAt: new Date() } }
    );
    repaired += result.modifiedCount;
  }
  console.log(JSON.stringify({ activeEscortTasks: escorts.length, repaired }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
