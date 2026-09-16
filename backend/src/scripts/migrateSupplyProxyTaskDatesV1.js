/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');

function plannedActionDate(order, earliest) {
  const plan = order.medicalProxyPlan || {};
  const serviceDate = order.desiredServiceDate || (plan.preferredDateStart ? new Date(`${plan.preferredDateStart}T09:00:00+08:00`) : null);
  if (!serviceDate || Number.isNaN(new Date(serviceDate).getTime())) return null;
  const date = new Date(serviceDate);
  date.setDate(date.getDate() - Math.max(0, Number(plan.leadDays) || 7));
  return date < earliest ? new Date(earliest) : date;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI);
  const orders = await Order.find({
    serviceName: { $in: ['代配药服务', '代配营养素服务'] },
    status: { $nin: ['completed', 'cancelled'] },
    initiationSource: 'staff_direct',
  }).select('_id desiredServiceDate medicalProxyPlan createdAt').lean();
  let updatedOrders = 0;
  let updatedTasks = 0;
  for (const order of orders) {
    const date = plannedActionDate(order, order.createdAt || new Date());
    if (!date) continue;
    const result = await FollowUp.updateMany({
      sourceType: 'order', sourceOrderId: order._id,
      workflowKey: { $in: ['medical_proxy:booking', 'medical_proxy:supervise'] },
      status: { $in: ['planned', 'in_progress', 'missed'] },
    }, { $set: { date, remindAt: date } });
    updatedOrders += 1;
    updatedTasks += result.modifiedCount || 0;
  }
  console.log(JSON.stringify({ activeSupplyProxyOrders: orders.length, updatedOrders, updatedTasks }));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => mongoose.disconnect());
module.exports = { main, plannedActionDate };
