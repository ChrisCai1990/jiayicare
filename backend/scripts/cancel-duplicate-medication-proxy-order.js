/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');
const User = require('../src/models/User');

const APPLY = process.argv.includes('--apply');
const TARGET = String(process.env.TARGET_ORDER_ID || '').trim();

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);
  const start = new Date('2026-09-16T14:00:00+08:00');
  const end = new Date('2026-09-16T15:00:00+08:00');
  const query = TARGET ? { _id: TARGET } : {
    serviceName: /代配药|代取药/,
    initiationSource: 'staff_direct',
    createdAt: { $gte: start, $lt: end },
  };
  const orders = await Order.find(query).sort({ createdAt: 1 }).lean();
  const results = [];
  for (const order of orders) {
    const [patient, tasks] = await Promise.all([
      User.findById(order.user).select('name').lean(),
      FollowUp.find({ sourceOrderId: order._id }).select('theme workflowKey status assignedTo createdAt').lean(),
    ]);
    results.push({ orderId: order._id, patient: patient?.name || '', serviceName: order.serviceName, status: order.status, createdAt: order.createdAt, tasks });
    if (!APPLY) continue;
    if (!TARGET || String(order._id) !== TARGET) throw new Error('执行取消时必须指定唯一 TARGET_ORDER_ID');
    if (['completed', 'cancelled'].includes(order.status)) throw new Error(`订单状态为 ${order.status}，未执行取消`);
    await Order.updateOne({ _id: order._id }, { $set: { status: 'cancelled', tradeStatus: 'closed', supervisionStatus: 'cancelled', currentAssignee: null, note: `${order.note ? `${order.note}\n` : ''}后台取消：重复代配药任务（2026-09-16）` } });
    await FollowUp.updateMany({ sourceOrderId: order._id, status: { $in: ['planned', 'in_progress', 'missed'] } }, { $set: { status: 'cancelled', isBlocked: true, cancelReason: '重复代配药任务，后台取消' } });
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', count: results.length, results }, null, 2));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
