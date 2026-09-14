require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');
const FollowUp = require('../models/FollowUp');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({ serviceName: /专家约诊/, status: 'completed', scheduledAt: { $gte: new Date() } });
  let reopened = 0;
  for (const order of orders) {
    const patient = await User.findById(order.user).select('assignedFamilyDoctor assignedHealthManager');
    if (!patient?.assignedFamilyDoctor || !patient?.assignedHealthManager) continue;
    const booking = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:booking' }).sort({ updatedAt: -1 });
    const preferredDateStart = booking?.formData?.preferredDateStart || order.scheduledAt.toISOString().slice(0, 10);
    const preferredDateEnd = booking?.formData?.preferredDateEnd || preferredDateStart;
    await FollowUp.findOneAndUpdate(
      { sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:appointment_review' },
      { $setOnInsert: { patientId: order.user, staffId: patient.assignedFamilyDoctor, assignedTo: patient.assignedFamilyDoctor, type: 'other', status: 'planned', date: new Date(), remindAt: new Date(), sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:appointment_review', taskRole: 'executor', dependsOnTaskId: booking?._id || null, theme: `专家约诊：健康顾问重新核对约诊需求 · ${order.serviceName}`, plannedContent: '历史预约曾被提前结案。请核对约诊需求与日期区间，保留原预约记录后转健管专员重新确认。', formData: { serviceContent: order.serviceRequirements || booking?.formData?.planSnapshot?.serviceContent || '', preferredDateStart, preferredDateEnd, previousBooking: booking?.formData || order.medicalProxyPlan?.booking || null } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    order.status = 'pending'; order.tradeStatus = 'fulfilling'; order.completedAt = null;
    await order.save();
    reopened++;
  }
  console.log(`已将 ${reopened} 个尚未就诊却提前完成的专家约诊订单退回健康顾问复核`);
  await mongoose.disconnect();
}
run().catch(error => { console.error(error); process.exit(1); });
