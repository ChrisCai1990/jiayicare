require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const User = require('../models/User');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const migrated = await FollowUp.find({ workflowKey: 'medical_proxy:appointment_review', status: 'planned', plannedContent: /历史预约曾被提前结案/ });
  let restored = 0;
  for (const task of migrated) {
    const patient = await User.findById(task.patientId).select('name').lean();
    if (patient?.name === '吴瑞砾') continue;
    const order = await Order.findById(task.sourceOrderId);
    if (!order || order.status !== 'pending' || order.tradeStatus !== 'fulfilling') continue;
    task.status = 'cancelled'; task.cancelReason = '历史订单无需人工重新核对，仅保留指定客户的复核任务';
    await task.save();
    const booking = await FollowUp.findOne({ sourceType: 'order', sourceOrderId: order._id, workflowKey: 'medical_proxy:booking', status: 'completed' }).sort({ completedAt: -1 });
    order.status = 'completed'; order.tradeStatus = 'completed'; order.completedAt = booking?.completedAt || order.updatedAt || new Date();
    await order.save();
    restored++;
  }
  console.log(`已清理 ${restored} 个非指定客户的历史复核任务`);
  await mongoose.disconnect();
}
run().catch(error => { console.error(error); process.exit(1); });
