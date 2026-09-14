/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');

const ACTIVE = ['planned', 'in_progress'];
const dateInput = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const active = await FollowUp.find({ sourceType: 'order', workflowKey: /^medical_proxy:/, status: { $in: ACTIVE } })
    .sort({ createdAt: -1 }).select('_id patientId sourceOrderId workflowKey assignedTo dependsOnTaskId formData createdAt').lean();
  let duplicatesCancelled = 0;
  const latestOrderByPatient = new Map();
  const seenStage = new Set();
  for (const task of active) {
    const patientKey = String(task.patientId);
    if (!latestOrderByPatient.has(patientKey)) latestOrderByPatient.set(patientKey, String(task.sourceOrderId));
    const obsoleteOrder = latestOrderByPatient.get(patientKey) !== String(task.sourceOrderId);
    const stageKey = `${patientKey}:${task.sourceOrderId}:${task.workflowKey}`;
    const duplicateStage = seenStage.has(stageKey);
    seenStage.add(stageKey);
    if (!obsoleteOrder && !duplicateStage) continue;
    const result = await FollowUp.updateOne({ _id: task._id, status: { $in: ACTIVE } }, { $set: {
      status: 'cancelled', cancelReason: obsoleteOrder ? '旧医疗代诊订单任务已由当前订单替代' : '重复的医疗代诊阶段任务已取消',
    } });
    duplicatesCancelled += result.modifiedCount || 0;
  }

  const executeTasks = await FollowUp.find({ sourceType: 'order', workflowKey: 'medical_proxy:execute', status: { $in: ACTIVE } }).lean();
  let bookingTasksCreated = 0;
  let executeTasksHeld = 0;
  for (const execute of executeTasks) {
    const [order, patient] = await Promise.all([
      Order.findById(execute.sourceOrderId).select('scheduledAt desiredServiceDate medicalProxyPlan serviceName').lean(),
      User.findById(execute.patientId).select('assignedHealthManager').lean(),
    ]);
    if (!order || !patient?.assignedHealthManager) continue;
    const existingBooking = await FollowUp.exists({ sourceType: 'order', sourceOrderId: execute.sourceOrderId, workflowKey: 'medical_proxy:booking' });
    const booking = await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: execute.sourceOrderId, workflowKey: 'medical_proxy:booking' },
      { $setOnInsert: {
        patientId: execute.patientId, staffId: execute.staffId, assignedTo: patient.assignedHealthManager,
        type: 'other', status: 'planned', date: new Date(), remindAt: new Date(), sourceType: 'order', sourceOrderId: execute.sourceOrderId,
        workflowKey: 'medical_proxy:booking', taskRole: 'executor', dependsOnTaskId: execute.dependsOnTaskId,
        theme: `医疗代诊：健管专员完成专家门诊预约 · ${order.serviceName}`,
        plannedContent: '依据健康顾问方案预约专家门诊；记录客户期望日期与专家实际出诊及约诊日期，日期不一致时记录沟通确认结果。',
        formData: { planSnapshot: execute.formData?.planSnapshot || order.medicalProxyPlan || {}, medicalAssistantId: execute.assignedTo, customerPreferredDate: dateInput(order.scheduledAt || order.desiredServiceDate) },
      } }, { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!booking) continue;
    if (!existingBooking) bookingTasksCreated += 1;
    const held = await FollowUp.updateOne({ _id: execute._id, status: { $in: ACTIVE } }, { $set: {
      assignedTo: null, isBlocked: true, activationEvent: '', dependsOnTaskId: booking._id,
      'formData.planSnapshot': execute.formData?.planSnapshot || order.medicalProxyPlan || {},
    } });
    executeTasksHeld += held.modifiedCount || 0;
    await FollowUp.updateOne({ sourceType: 'order', sourceOrderId: execute.sourceOrderId, workflowKey: 'medical_proxy:supervise' }, { $set: {
      'formData.currentStage': 'booking', content: '当前环节：健管专员完成专家门诊预约',
    } });
  }
  console.log(JSON.stringify({ duplicatesCancelled, bookingTasksCreated, executeTasksHeld }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main };
