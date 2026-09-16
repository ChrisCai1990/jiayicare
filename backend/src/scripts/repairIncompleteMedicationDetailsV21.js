require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({
    serviceName: /代配药|代取药/,
    status: { $in: ['pending', 'scheduled'] },
    currentStage: { $ne: 'completed' },
    $or: [
      { 'medicalProxyPlan.medicationName': { $in: ['', null] } },
      { 'medicalProxyPlan.medicationBrand': { $in: ['', null] } },
      { 'medicalProxyPlan.medicationQuantity': { $in: ['', null] } },
    ],
  }).select('_id').lean();
  let repaired = 0;
  for (const order of orders) {
    const booking = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:booking' });
    if (!booking?.assignedTo) continue;
    booking.status = 'in_progress'; booking.isBlocked = false; booking.completedAt = null; booking.completedBy = null;
    booking.remindAt = new Date(); booking.content = '配药清单缺少药物名称、品牌或数量，请补齐并重新确认预约。';
    await booking.save();
    await FollowUp.updateMany(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: { $in: ['medical_proxy:planner', 'medical_proxy:execute'] } },
      { $set: { status: 'planned', isBlocked: true, completedAt: null, completedBy: null } },
    );
    await FollowUp.updateOne(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:supervise' },
      { $set: { status: 'in_progress', 'formData.currentStage': 'booking', content: '配药清单不完整，已退回健管专员补充药物名称、品牌和数量。' } },
    );
    await Order.updateOne({ _id: order._id }, { $set: { currentStage: 'booking', currentAssignee: booking.assignedTo, supervisionStatus: 'needs_attention' } });
    repaired += 1;
  }
  console.log(JSON.stringify({ incompleteOrders: orders.length, repaired }));
  await mongoose.disconnect();
}

main().catch(async error => { console.error(error); await mongoose.disconnect(); process.exit(1); });
