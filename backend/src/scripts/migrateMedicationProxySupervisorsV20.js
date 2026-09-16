/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({
    serviceName: /代配药|代取药/,
    status: { $nin: ['completed', 'cancelled', 'refunded'] },
  }).select('_id user serviceName serviceRequirements currentStage status').lean();
  let created = 0;
  let skipped = 0;
  for (const order of orders) {
    const activeTask = await FollowUp.findOne({
      sourceType: 'order', sourceOrderId: order._id,
      workflowKey: /^medical_proxy:/, taskRole: 'executor',
      status: { $in: ['planned', 'in_progress', 'missed'] },
    }).sort({ isBlocked: 1, updatedAt: -1 }).lean();
    if (!activeTask) { skipped += 1; continue; }
    const patient = await User.findById(order.user).select('assignedHealthPlanner').lean();
    if (!patient?.assignedHealthPlanner) { skipped += 1; continue; }
    const currentStage = String(order.currentStage || activeTask.workflowKey.slice('medical_proxy:'.length) || 'booking');
    const result = await FollowUp.updateOne(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:supervise' },
      { $setOnInsert: {
        patientId: order.user, staffId: patient.assignedHealthPlanner, assignedTo: patient.assignedHealthPlanner,
        type: 'other', status: 'in_progress', date: new Date(), remindAt: new Date(),
        sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:supervise', taskRole: 'supervisor',
        theme: `代配药：健康规划师全程督办 · ${order.serviceName}`,
        plannedContent: '持续督办健管预约、执行人员分配、配药确认和配送，服务完成后自动闭环。',
        formData: { currentStage, medicationProxy: true, serviceContent: order.serviceRequirements || '' },
      } },
      { upsert: true },
    );
    created += result.upsertedCount || 0;
  }
  console.log(JSON.stringify({ activeMedicationOrders: orders.length, supervisorsCreated: created, skipped }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());

module.exports = { main };
