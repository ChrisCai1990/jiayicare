const Message = require('../models/Message');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Device = require('../models/StaffPushDevice');
const Delivery = require('../models/StaffPushDelivery');
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
    const patients = await User.find({ tenantId: staff.tenantId,
      [CHANNELS[message.recipient].field]: staff._id }).select('_id').lean();
    const unreadCount = await Message.countDocuments({ user: { $in: patients.map(row => row._id) },
      type: 'user', recipient: message.recipient, staffReadAt: null, recalled: { $ne: true } });
    for (const device of devices) await sender.send(device.token, unreadCount);
    await finish(item, 'sent', '', staff._id);
  } catch {
    // An uncertain provider response is not retried automatically, to avoid duplicate alerts.
    await finish(item, 'failed', 'provider_unconfirmed', staff._id);
  }
}
async function tick() {
  const config = pushReady();
  if (!config || running) return;
  running = true;
  try {
    await Delivery.updateMany({ status: 'sending', claimedAt: { $lt: new Date(Date.now() - 120000) } },
      { $set: { status: 'failed', reason: 'send_interrupted', finishedAt: new Date() } });
    const missed = await Message.find({ type: 'user', recipient: { $in: Object.keys(CHANNELS) },
      createdAt: { $gte: config.startAt }, staffPushQueuedAt: null })
      .sort({ createdAt: 1 }).limit(100).select('_id').lean();
    for (const message of missed) await enqueue(message._id);
    const pending = await Delivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
    for (const candidate of pending) {
      const item = await Delivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
        { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
      if (item) await send(item, config);
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
module.exports = { enqueue, send, tick, start };
