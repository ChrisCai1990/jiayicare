/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const advisors = await db.collection('followups').find({
    taskRole: 'executor',
    theme: /门诊一站式.*健康顾问评估及医院专家确定/,
    status: 'completed',
    formData: { $ne: null },
  }).toArray();
  let copied = 0;
  for (const advisor of advisors) {
    const result = await db.collection('followups').updateOne(
      { sourceHealthPlanId: advisor.sourceHealthPlanId, taskRole: 'supervisor', workflowKey: advisor.workflowKey || '' },
      { $set: { formData: advisor.formData, updatedAt: new Date() } }
    );
    copied += result.modifiedCount;
  }
  console.log(JSON.stringify({ advisorTasks: advisors.length, copied }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { main };
