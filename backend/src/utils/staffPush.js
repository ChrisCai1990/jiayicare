const Message = require('../models/Message');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Device = require('../models/StaffPushDevice');
const Delivery = require('../models/StaffPushDelivery');
const Group = require('../models/InAppServiceGroup');
const GroupMessage = require('../models/InAppServiceGroupMessage');
const GroupDelivery = require('../models/StaffGroupPushDelivery');
const OrderDelivery = require('../models/StaffOrderPushDelivery');
const FollowUp = require('../models/FollowUp');
const Order = require('../models/Order');
const { assignedIds, canStaffAccess, canUseGroupModule, needsStaffReply, same } = require('./inAppServiceGroupPolicy');
const { unreadCount } = require('./staffPushUnreadCount');
const { CHANNELS, pushReady, assignee } = require('./staffPushCore');
const { createStaffPushTransport } = require('./staffPushTransport');

let running = false;
let cachedTransport;
function transport() {
  if (!cachedTransport) cachedTransport = createStaffPushTransport({
    clientId: process.env.STAFF_HUAWEI_PUSH_CLIENT_ID,
    clientSecret: process.env.STAFF_HUAWEI_PUSH_CLIENT_SECRET,
  });
  return cachedTransport;
}
async function enqueue(messageId) {
  if (!pushReady()) return;
  await Delivery.updateOne({ messageId }, { $setOnInsert: { messageId, status: 'queued' } }, { upsert: true });
  await Message.updateOne({ _id: messageId }, { $set: { staffPushQueuedAt: new Date() } });
}
async function enqueueGroup(message) {
  if (!pushReady() || !message.staffPushEligible || message.senderType !== 'customer') return;
  const group = await Group.findOne({ _id: message.groupId, tenantId: message.tenantId, status: 'active' }).lean();
  const patient = group && await User.findOne({ _id: group.patientId, tenantId: group.tenantId,
    isDeleted: { $ne: true } }).lean();
  if (patient) {
    const members = (group.memberIds || []).filter(id => assignedIds(patient).some(value => same(value, id)));
    for (const staffId of members) {
      await GroupDelivery.updateOne({ groupMessageId: message._id, staffId },
        { $setOnInsert: { groupMessageId: message._id, staffId, status: 'queued' } }, { upsert: true });
    }
  }
  await GroupMessage.updateOne({ _id: message._id }, { $set: { staffPushQueuedAt: new Date() } });
}
async function finish(item, status, reason = '', staffId = null) {
  await Delivery.updateOne({ _id: item._id, status: 'sending' },
    { $set: { status, reason, staffId, finishedAt: new Date() } });
}
async function send(item, config, sender = transport()) {
  const message = await Message.findById(item.messageId).lean();
  if (!message || message.type !== 'user' || message.staffReadAt || message.recalled ||
      new Date(message.createdAt) < config.startAt || !CHANNELS[message.recipient]) {
    return finish(item, 'skipped', 'message_not_pending');
  }
  const patient = await User.findById(message.user).lean();
  const staffId = patient?.[CHANNELS[message.recipient].field];
  const staff = staffId ? await Admin.findById(staffId).lean() : null;
  if (!assignee(message, patient, staff)) return finish(item, 'skipped', 'assignee_unavailable');
  const devices = await Device.find({ staffId: staff._id, tenantId: staff.tenantId,
    tokenExpiresAt: { $gt: new Date() } }).select('+token').lean();
  if (!devices.length) return finish(item, 'skipped', 'no_device', staff._id);
  try {
    const count = await unreadCount(staff);
    for (const device of devices) await sender.send(device.token, count);
    await finish(item, 'sent', '', staff._id);
  } catch {
    // An uncertain provider response is not retried automatically, to avoid duplicate alerts.
    await finish(item, 'failed', 'provider_unconfirmed', staff._id);
  }
}
async function sendGroup(item, config, sender = transport()) {
  const finishGroup = (status, reason = '') => GroupDelivery.updateOne({ _id: item._id, status: 'sending' },
    { $set: { status, reason, finishedAt: new Date() } });
  const [message, staff] = await Promise.all([
    GroupMessage.findById(item.groupMessageId).lean(), Admin.findById(item.staffId).lean(),
  ]);
  if (!message || message.senderType !== 'customer' || !message.staffPushEligible ||
      new Date(message.createdAt) < config.startAt || !staff || staff.staffStatus !== 'active' || staff.mustChangePassword)
    return finishGroup('skipped', 'message_or_staff_unavailable');
  const group = await Group.findOne({ _id: message.groupId, tenantId: message.tenantId, status: 'active' }).lean();
  const patient = group && await User.findOne({ _id: group.patientId, tenantId: group.tenantId,
    isDeleted: { $ne: true } }).lean();
  if (!same(message.patientId, group?.patientId) || !canStaffAccess(group, patient, staff) ||
      !needsStaffReply(group)) return finishGroup('skipped', 'membership_or_reply_changed');
  if (staff.customRoleId) {
    const role = await require('../models/StaffRole').findById(staff.customRoleId).select('permissions').lean();
    if (!canUseGroupModule(role?.permissions)) return finishGroup('skipped', 'module_disabled');
  }
  const devices = await Device.find({ staffId: staff._id, tenantId: staff.tenantId,
    tokenExpiresAt: { $gt: new Date() } }).select('+token').lean();
  if (!devices.length) return finishGroup('skipped', 'no_device');
  try {
    const count = await unreadCount(staff);
    for (const device of devices) await sender.send(device.token, count);
    await finishGroup('sent');
  } catch {
    await finishGroup('failed', 'provider_unconfirmed');
  }
}
async function sendOrder(item, sender = transport(), countUnread = unreadCount) {
  const finishOrder = (status, reason = '') => OrderDelivery.updateOne({ _id: item._id, status: 'sending' },
    { $set: { status, reason, finishedAt: new Date() } });
  const [task, staff] = await Promise.all([
    FollowUp.findById(item.taskId).lean(), Admin.findById(item.staffId).lean(),
  ]);
  if (!task || !staff || staff.role !== 'healthPlanner' || staff.staffStatus !== 'active' || staff.mustChangePassword ||
      String(task.assignedTo) !== String(staff._id) || String(task.tenantId) !== String(staff.tenantId) ||
      task.sourceType !== 'order' || !['planned', 'in_progress', 'missed'].includes(task.status) || task.isBlocked)
    return finishOrder('skipped', 'task_or_staff_unavailable');
  const order = await Order.findOne({ _id: task.sourceOrderId, tenantId: staff.tenantId,
    initiationSource: 'customer', paymentStatus: 'paid', status: { $in: ['pending', 'scheduled'] },
    tradeStatus: { $nin: ['closed', 'refunded'] } }).lean();
  if (!order || String(order.user) !== String(task.patientId)) return finishOrder('skipped', 'order_unavailable');
  const devices = await Device.find({ staffId: staff._id, tenantId: staff.tenantId,
    tokenExpiresAt: { $gt: new Date() } }).select('+token').lean();
  if (!devices.length) return finishOrder('skipped', 'no_device');
  try {
    const count = await countUnread(staff);
    for (const device of devices) await sender.send(device.token, count, '有新的服务产品订单任务待处理，请打开工作台查看。');
    await finishOrder('sent');
  } catch {
    await finishOrder('failed', 'provider_unconfirmed');
  }
}
async function tick() {
  const config = pushReady();
  if (!config || running) return;
  running = true;
  try {
    await Delivery.updateMany({ status: 'sending', claimedAt: { $lt: new Date(Date.now() - 120000) } },
      { $set: { status: 'failed', reason: 'send_interrupted', finishedAt: new Date() } });
    await GroupDelivery.updateMany({ status: 'sending', claimedAt: { $lt: new Date(Date.now() - 120000) } },
      { $set: { status: 'failed', reason: 'send_interrupted', finishedAt: new Date() } });
    await OrderDelivery.updateMany({ status: 'sending', claimedAt: { $lt: new Date(Date.now() - 120000) } },
      { $set: { status: 'failed', reason: 'send_interrupted', finishedAt: new Date() } });
    const missed = await Message.find({ type: 'user', recipient: { $in: Object.keys(CHANNELS) },
      createdAt: { $gte: config.startAt }, staffPushQueuedAt: null })
      .sort({ createdAt: 1 }).limit(100).select('_id').lean();
    for (const message of missed) await enqueue(message._id);
    const missedGroups = await GroupMessage.find({ senderType: 'customer', staffPushEligible: true,
      staffPushQueuedAt: null, createdAt: { $gte: config.startAt } }).sort({ createdAt: 1 }).limit(100).lean();
    for (const message of missedGroups) await enqueueGroup(message);
    const pending = await Delivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
    for (const candidate of pending) {
      const item = await Delivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
        { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
      if (item) await send(item, config);
    }
    const pendingGroups = await GroupDelivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
    for (const candidate of pendingGroups) {
      const item = await GroupDelivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
        { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
      if (item) await sendGroup(item, config);
    }
    const orderStartAt = new Date(process.env.STAFF_ORDER_PUSH_START_AT || '');
    if (Number.isFinite(orderStartAt.getTime())) {
      const newlyPaid = await Order.find({ initiationSource: 'customer', paymentStatus: 'paid',
        paidAt: { $gte: orderStartAt }, status: { $in: ['pending', 'scheduled'] },
        tradeStatus: { $nin: ['closed', 'refunded'] } }).sort({ paidAt: -1 }).limit(200).select('_id').lean();
      const tasks = await FollowUp.collection.find({ sourceType: 'order', sourceOrderId: { $ne: null },
        status: { $in: ['planned', 'in_progress', 'missed'] }, isBlocked: { $ne: true },
        $or: [{ updatedAt: { $gte: orderStartAt } }, { sourceOrderId: { $in: newlyPaid.map(order => order._id) } }] })
        .sort({ updatedAt: -1 }).limit(200).project({ _id: 1, assignedTo: 1, tenantId: 1, sourceOrderId: 1 }).toArray();
      const staffIds = [...new Set(tasks.map(task => String(task.assignedTo || '')).filter(Boolean))];
      const staffMembers = await Admin.find({ _id: { $in: staffIds }, role: 'healthPlanner', staffStatus: 'active' }).select('_id tenantId').lean();
      const byId = new Map(staffMembers.map(staff => [String(staff._id), staff]));
      const orderIds = [...new Set(tasks.map(task => String(task.sourceOrderId)))];
      const orders = await Order.find({ _id: { $in: orderIds }, initiationSource: 'customer', paymentStatus: 'paid',
        status: { $in: ['pending', 'scheduled'] }, tradeStatus: { $nin: ['closed', 'refunded'] } }).select('_id tenantId').lean();
      const validOrders = new Map(orders.map(order => [String(order._id), order]));
      const existing = await OrderDelivery.find({ taskId: { $in: tasks.map(task => task._id) } }).select('taskId staffId').lean();
      const queuedKeys = new Set(existing.map(item => `${item.taskId}:${item.staffId}`));
      for (const task of tasks) {
        const staff = byId.get(String(task.assignedTo));
        const order = validOrders.get(String(task.sourceOrderId));
        if (!staff || !order || String(task.tenantId) !== String(staff.tenantId) || String(order.tenantId) !== String(staff.tenantId)) continue;
        const key = `${task._id}:${staff._id}`;
        if (queuedKeys.has(key)) continue;
        await OrderDelivery.updateOne({ taskId: task._id, staffId: staff._id },
          { $setOnInsert: { taskId: task._id, staffId: staff._id, status: 'queued' } }, { upsert: true });
        queuedKeys.add(key);
      }
      const pendingOrders = await OrderDelivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
      for (const candidate of pendingOrders) {
        const item = await OrderDelivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
          { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
        if (item) await sendOrder(item);
      }
    }
  } finally { running = false; }
}
function start() {
  if (!pushReady()) return;
  const run = () => tick().catch(() => console.error('[staff-push] scan failed'));
  setImmediate(run);
  const timer = setInterval(run, 10000);
  timer.unref();
}
module.exports = { enqueue, enqueueGroup, send, sendGroup, sendOrder, tick, start };
