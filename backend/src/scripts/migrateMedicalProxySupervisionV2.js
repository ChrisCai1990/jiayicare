/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const tasks = await FollowUp.find({ workflowKey: /^medical_proxy:/, status: { $in: ['planned', 'in_progress'] }, sourceType: 'order' }).lean();
  const orders = new Map();
  for (const task of tasks) {
    if (task.workflowKey === 'medical_proxy:supervise') continue;
    const key = String(task.sourceOrderId || '');
    if (!key || orders.has(key)) continue;
    orders.set(key, task);
  }
  let created = 0;
  for (const task of orders.values()) {
    const patient = await User.findById(task.patientId).select('assignedHealthPlanner').lean();
    const plannerId = patient?.assignedHealthPlanner || task.staffId;
    if (!plannerId) continue;
    const stage = String(task.workflowKey).slice('medical_proxy:'.length);
    const result = await FollowUp.updateOne(
      { sourceType: 'order', sourceOrderId: task.sourceOrderId, workflowKey: 'medical_proxy:supervise' },
      { $setOnInsert: {
        patientId: task.patientId, staffId: plannerId, assignedTo: plannerId,
        type: 'other', status: 'in_progress', date: new Date(), remindAt: new Date(),
        sourceType: 'order', sourceOrderId: task.sourceOrderId,
        workflowKey: 'medical_proxy:supervise', taskRole: 'supervisor',
        theme: '医疗代诊：健康规划师全程督办',
        plannedContent: '持续督办资料、方案确认和代诊执行，代诊结束后自动关闭。',
        formData: { currentStage: stage },
      } }, { upsert: true },
    );
    created += result.upsertedCount || 0;
  }
  console.log(JSON.stringify({ activeOrders: orders.size, supervisorsCreated: created }));
}

if (require.main === module) main().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { main };
