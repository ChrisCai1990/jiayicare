/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const current = await FollowUp.find({
    sourceType: 'order', workflowKey: 'medical_proxy:supervise',
    status: { $in: ['planned', 'in_progress'] },
    theme: /^医疗代诊[：:]\s*健康规划师全程督办\s*·\s*.+/,
  }).sort({ createdAt: -1 }).select('_id patientId sourceOrderId createdAt').lean();
  let cancelled = 0;
  for (const task of current) {
    const result = await FollowUp.updateMany({
      _id: { $ne: task._id }, patientId: task.patientId,
      sourceType: 'order', workflowKey: 'medical_proxy:supervise',
      sourceOrderId: { $ne: task.sourceOrderId }, status: { $in: ['planned', 'in_progress'] },
      theme: /^医疗代诊[：:]\s*健康规划师全程督办\s*$/,
      createdAt: { $lt: task.createdAt },
    }, { $set: { status: 'cancelled', cancelReason: '旧版医疗代诊督办已由当前订单督办替代' } });
    cancelled += result.modifiedCount || 0;
  }
  console.log(JSON.stringify({ currentOrderSupervisors: current.length, legacyOrderSupervisorsCancelled: cancelled }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
