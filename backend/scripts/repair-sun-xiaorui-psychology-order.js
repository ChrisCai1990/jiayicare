/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Order = require('../src/models/Order');
const FollowUp = require('../src/models/FollowUp');
const HealthPlan = require('../src/models/HealthPlan');
const Commission = require('../src/models/Commission');
const Coupon = require('../src/models/Coupon');
const PushRecord = require('../src/models/PushRecord');

const APPLY = process.argv.includes('--apply');
const REMOVE_LEGACY_1200 = process.argv.includes('--remove-legacy-1200');

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

  if (REMOVE_LEGACY_1200) {
    const legacyOrders = orders.filter(order =>
      Number(order.servicePrice) === 1200
      && order.status === 'completed'
      && new Date(order.createdAt).toISOString() === '2026-07-29T01:50:01.193Z'
    );
    if (legacyOrders.length !== 1) {
      throw new Error(`旧1200元候选订单数量为 ${legacyOrders.length}，为避免误删已停止`);
    }
    const legacy = legacyOrders[0];
    const [followUps, plans, commissions, coupons, pushRecord] = await Promise.all([
      FollowUp.find({ sourceOrderId: legacy._id }).lean(),
      HealthPlan.find({ sourceOrderId: legacy._id }).lean(),
      Commission.find({ orderId: legacy._id }).lean(),
      Coupon.find({ usedOrderId: legacy._id }).lean(),
      legacy.pushRecordId ? PushRecord.findById(legacy.pushRecordId).lean() : null,
    ]);
    console.log(JSON.stringify({
      legacyOrderId: legacy._id,
      related: {
        followUps: followUps.length,
        healthPlans: plans.length,
        commissions: commissions.length,
        coupons: coupons.length,
        pushRecord: pushRecord ? 1 : 0,
      },
    }, null, 2));
    if (!APPLY) return;

    const backup = {
      kind: 'remove-sun-xiaorui-legacy-psychology-order-1200',
      createdAt: new Date(),
      user: { _id: user._id, name: user.name, phone: user.phone },
      order: legacy,
      followUps,
      healthPlans: plans,
      commissions,
      coupons,
      pushRecord,
    };
    const backupResult = await mongoose.connection.collection('maintenance_backups').insertOne(backup);

    await FollowUp.deleteMany({ sourceOrderId: legacy._id });
    await HealthPlan.deleteMany({ sourceOrderId: legacy._id });
    await Commission.deleteMany({ orderId: legacy._id });
    await Coupon.updateMany(
      { usedOrderId: legacy._id },
      { $set: { status: 'active', usedAt: null, usedOrderId: null } },
    );
    if (legacy.pushRecordId) await PushRecord.deleteOne({ _id: legacy.pushRecordId });
    const deleted = await Order.deleteOne({ _id: legacy._id, user: user._id });
    if (deleted.deletedCount !== 1) throw new Error(`旧订单未成功删除；请用维护备份 ${backupResult.insertedId} 排查`);
    console.log(`已清理旧1200元订单 ${legacy._id}；维护备份 ${backupResult.insertedId}`);
    return;
  }

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
