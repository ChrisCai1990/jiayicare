/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const { scheduleExpertAppointmentReminders } = require('../utils/appointmentReminderScheduler');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const bookings = await FollowUp.find({ workflowKey: 'medical_proxy:booking', status: 'completed' }).lean();
  let scheduled = 0;
  for (const booking of bookings) {
    const order = await Order.findOne({ _id: booking.sourceOrderId, serviceName: /专家约诊/ }).lean();
    if (!order || !booking.formData?.appointmentDate || !booking.formData?.appointmentTime) continue;
    const appointmentDate = new Date(`${booking.formData.appointmentDate}T${booking.formData.appointmentTime}:00+08:00`);
    const requirement = booking.formData?.planSnapshot?.serviceContent || order.serviceRequirements || '已确认';
    await scheduleExpertAppointmentReminders({
      order,
      appointmentDate,
      appointmentText: `预约时间：${booking.formData.appointmentDate} ${booking.formData.appointmentTime}\n约诊需求：${requirement}`,
    });
    scheduled++;
  }
  console.log(JSON.stringify({ scanned: bookings.length, scheduled }));
  await mongoose.disconnect();
}

run().catch(async error => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
