/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const canonical = await FollowUp.find({
    sourceType: 'order', workflowKey: 'medical_proxy:supervise', status: { $in: ['planned', 'in_progress'] },
  }).select('patientId sourceOrderId createdAt').lean();
  let cancelled = 0;
  for (const task of canonical) {
    const result = await FollowUp.updateMany({
      _id: { $ne: task._id }, patientId: task.patientId,
      status: { $in: ['planned', 'in_progress'] },
      theme: /^医疗代诊[：:]\s*健康规划师全程督办\s*$/,
      $or: [{ workflowKey: { $exists: false } }, { workflowKey: { $in: ['', null] } }],
      createdAt: { $lte: task.createdAt },
    }, { $set: {
      status: 'cancelled', cancelReason: '已由订单级医疗代诊全程督办任务替代',
      completedAt: null, completedBy: null,
    } });
    cancelled += result.modifiedCount || 0;
  }
  console.log(JSON.stringify({ activeCanonicalSupervisors: canonical.length, legacySupervisorsCancelled: cancelled }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
