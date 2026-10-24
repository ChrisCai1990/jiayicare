// Staff WeCom notices for customer messages in the JiayiCare App / mini program.
// The notice deliberately contains no customer identity or conversation content.
const Message = require('../models/Message');
const Delivery = require('../models/WecomMessageAlert');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Link = require('../models/WecomAppLink');
const { getConversationRole } = require('./conversationRoles');

const ASSIGNED_FIELD = {
  doctor: 'assignedFamilyDoctor',
  manager: 'assignedHealthManager',
  planner: 'assignedHealthPlanner',
  nutritionist: 'assignedNutritionist',
  medicalAssistant: 'assignedMedicalAssistant',
};
let running = false;

function settings() {
  const startAt = new Date(process.env.WECOM_MESSAGE_ALERTS_START_AT || '');
  let origin;
  try {
    const url = new URL(process.env.WECOM_SIDEBAR_ORIGIN || '');
    if (url.protocol === 'https:' && !url.username && !url.password) origin = url.origin;
  } catch {}
  if (process.env.WECOM_MESSAGE_ALERTS_ENABLED !== 'true' ||
      !Number.isFinite(startAt.getTime()) || !origin ||
      !process.env.WECOM_CORP_ID || !process.env.WECOM_APP_SECRET || !process.env.WECOM_AGENT_ID) return null;
  return { startAt, origin };
}

async function enqueue(messageId) {
  if (!settings()) return;
  await Delivery.updateOne({ messageId }, { $setOnInsert: { messageId, status: 'queued' } }, { upsert: true });
  await Message.updateOne({ _id: messageId }, { $set: { wecomAlertQueuedAt: new Date() } });
}

const same = (a, b) => String(a || '') === String(b || '');

async function finish(item, status, reason = '', staffId = null, conversationId = '') {
  await Delivery.updateOne({ _id: item._id, status: 'sending' }, {
    $set: { status, reason, staffId, conversationId, finishedAt: new Date() },
  });
}

async function send(item, config) {
  const message = await Message.findById(item.messageId).lean();
  if (!message || message.type !== 'user' || message.staffReadAt || message.recalled ||
      new Date(message.createdAt) < config.startAt) return finish(item, 'skipped', 'message_not_pending');
  const role = getConversationRole(message.recipient);
  const field = ASSIGNED_FIELD[message.recipient];
  if (!role || !field) return finish(item, 'skipped', 'unsupported_channel');
  const patient = await User.findById(message.user).lean();
  const staffId = patient?.[field];
  if (!staffId) return finish(item, 'skipped', 'no_assignee');
  const staff = await Admin.findById(staffId).lean();
  if (!staff || staff.staffStatus !== 'active' || staff.mustChangePassword ||
      staff.role !== role.staffRole || !same(staff.tenantId, patient.tenantId))
    return finish(item, 'skipped', 'assignee_unavailable');
  const link = await Link.findOne({ staffId: staff._id, tenantId: staff.tenantId || null,
    corpId: process.env.WECOM_CORP_ID }).lean();
  if (!link?.userId) return finish(item, 'skipped', 'wecom_not_linked', staff._id);
  const recent = await Delivery.findOne({ staffId: staff._id, conversationId: message.conversationId,
    status: 'sent', finishedAt: { $gte: new Date(Date.now() - 60000) } }).lean();
  if (recent) return finish(item, 'skipped', 'recent_notice', staff._id, message.conversationId);

  // Claim-before-send means an uncertain network outcome is not sent a second time.
  // A failed delivery stays visible in the delivery collection for operational review.
  try {
    const tokenResponse = await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?' +
      new URLSearchParams({ corpid: process.env.WECOM_CORP_ID, corpsecret: process.env.WECOM_APP_SECRET }),
      { signal: AbortSignal.timeout(12000) });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || token.errcode || !token.access_token) throw new Error('auth_failed');
    const response = await fetch('https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=' +
      encodeURIComponent(token.access_token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ touser: link.userId, msgtype: 'text', agentid: Number(process.env.WECOM_AGENT_ID),
        text: { content: `您有一条新的客户消息，请登录嘉医汇医护端查看。\n${config.origin}/notifications?tab=userMsgs` } }),
    });
    const result = await response.json();
    if (!response.ok || result.errcode || result.invaliduser) throw new Error('send_failed');
    await finish(item, 'sent', '', staff._id, message.conversationId);
  } catch (error) {
    await finish(item, 'failed', String(error.message || 'send_failed').slice(0, 80), staff._id, message.conversationId);
    console.error('[wecom-message-alert] delivery failed', String(item._id));
  }
}

async function tick() {
  const config = settings();
  if (running || !config) return;
  running = true;
  try {
    // Recover the narrow gap between saving a customer message and enqueueing it.
    const missed = await Message.find({ type: 'user', createdAt: { $gte: config.startAt },
      wecomAlertQueuedAt: { $exists: false } }).sort({ createdAt: 1 }).limit(100).select('_id').lean();
    for (const message of missed) await enqueue(message._id);
    const pending = await Delivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
    for (const candidate of pending) {
      const item = await Delivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
        { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
      if (item) {
        try { await send(item, config); }
        catch (error) {
          await Delivery.updateOne({ _id: item._id, status: 'sending' },
            { $set: { status: 'failed', reason: 'processing_failed', finishedAt: new Date() } });
          console.error('[wecom-message-alert] processing failed', String(item._id), error.message);
        }
      }
    }
  } finally { running = false; }
}

function start() {
  if (!settings()) return;
  const run = () => tick().catch(error => console.error('[wecom-message-alert] scan failed', error.message));
  setImmediate(run);
  const timer = setInterval(run, 10000);
  timer.unref();
}

module.exports = { enqueue, tick, start, settings };
