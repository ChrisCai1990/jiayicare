/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('缺少 MONGODB_URI');
  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ name: '孙筱蕊' })
    .select('_id name phone assignedHealthPlanner')
    .lean();
  if (!user) throw new Error('未找到用户：孙筱蕊');

  const orders = await Order.find({
    user: user._id,
    serviceName: /心理咨询/,
  }).sort({ createdAt: -1 }).lean();

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    user: { id: user._id, name: user.name, phone: user.phone },
    candidates: orders.map(order => ({
      id: order._id,
      serviceName: order.serviceName,
      servicePrice: order.servicePrice,
      specificationLabel: order.specificationLabel,
      status: order.status,
      createdAt: order.createdAt,
    })),
  }, null, 2));

  if (!APPLY) return;
  if (orders.length !== 1) {
    throw new Error(`候选订单数量为 ${orders.length}，为避免误改已停止；请先人工确认数据`);
  }

  const order = orders[0];
  await Order.collection.updateOne(
    { _id: order._id, user: user._id },
    {
      $set: {
        servicePrice: 9600,
        specificationLabel: '12次成长计划（遇见更好的自己）',
        unitPrice: 800,
        totalUnits: 12,
        // 历史“标记完成”视为已经提供过1次服务；从第2次开始使用正式核销记录。
        usedUnits: order.status === 'completed' ? 1 : (order.usedUnits || 0),
        status: order.status === 'completed' ? 'scheduled' : order.status,
        completedAt: null,
      },
    },
  );
  if (!user.assignedHealthPlanner) throw new Error('孙筱蕊尚未配置健康规划师，已停止修复以避免错误派单');
  await FollowUp.updateMany(
    { sourceType: 'order', sourceOrderId: order._id, status: { $nin: ['completed', 'cancelled'] } },
    { $set: { staffId: user.assignedHealthPlanner, assignedTo: user.assignedHealthPlanner } },
  );
  console.log(`已修复订单 ${order._id}：总价9600元，共12次，订单恢复为进行中`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
