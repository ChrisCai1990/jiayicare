/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const PLAN_NAME = '门诊一站式：资料收集与核对';
const COMPLETION_STANDARD = '已收齐本次就医诉求、病历、既往报告、当前用药及身份医保资料；客户提供的报告已上传归档；资料完整性已审核，缺失项和待补内容已明确。';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const plan = await db.collection('followupplans').findOne({ name: PLAN_NAME });
  if (!plan) throw new Error(`${PLAN_NAME}不存在`);
  await db.collection('followupplans').updateOne({ _id: plan._id }, { $set: { completionStandard: COMPLETION_STANDARD, updatedAt: new Date() } });
  const taskResult = await db.collection('followups').updateMany(
    { workflowKey: String(plan._id), taskRole: 'executor', status: { $in: ['planned', 'in_progress'] } },
    { $set: { serviceChecklist: [{ key: `workflow_${plan._id}`, purpose: COMPLETION_STANDARD }], updatedAt: new Date() } }
  );
  console.log(JSON.stringify({ plan: PLAN_NAME, activeTasksUpdated: taskResult.modifiedCount }, null, 2));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { PLAN_NAME, COMPLETION_STANDARD };
