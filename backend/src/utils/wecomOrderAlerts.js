// A new paid customer order alerts the planner who actually has its order task.
// No customer identity, order details or message content is sent to WeCom.
const Order = require('../models/Order');
const FollowUp = require('../models/FollowUp');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Link = require('../models/WecomAppLink');
const Delivery = require('../models/WecomOrderAlert');

const ACTIVE_TRADES = ['paid', 'fulfilling', 'partially_refunded'];
const ACTIVE_REFUNDS = ['', 'none', 'failed', 'partially_refunded', null];
const ACTIVE_TASKS = ['planned', 'in_progress', 'missed'];
let running = false;
let scanCursor = null;

function settings() {
  const startAt = new Date(process.env.WECOM_ORDER_ALERTS_START_AT || '');
  let origin;
  try {
    const url = new URL(process.env.WECOM_SIDEBAR_ORIGIN || '');
    if (url.protocol === 'https:' && !url.username && !url.password) origin = url.origin;
  } catch {}
  if (process.env.WECOM_ORDER_ALERTS_ENABLED !== 'true' ||
      !Number.isFinite(startAt.getTime()) || !origin ||
      !process.env.WECOM_CORP_ID || !process.env.WECOM_APP_SECRET || !process.env.WECOM_AGENT_ID) return null;
  return { startAt, origin };
}

const same = (a, b) => String(a || '') === String(b || '');

function activeCustomerOrder(order, startAt) {
  return order?.paymentStatus === 'paid' &&
    ['customer', '', null, undefined].includes(order.initiationSource) &&
    ['pending', 'scheduled'].includes(order.status) &&
    ACTIVE_TRADES.includes(order.tradeStatus) &&
    (order.refundStatus == null || ACTIVE_REFUNDS.includes(order.refundStatus)) &&
    Number.isFinite(new Date(order.paidAt).getTime()) &&
    new Date(order.paidAt) >= startAt;
}

async function enqueue(orderId, taskId) {
  await Delivery.updateOne({ orderId }, { $setOnInsert: { orderId, taskId, status: 'queued' } }, { upsert: true });
  // The marker is delivery metadata, not a business order update. Avoid the
  // Order.updateOne hook that reconciles service tasks and package redemption.
  await Order.collection.updateOne({ _id: orderId, wecomOrderAlertQueuedAt: null },
    { $set: { wecomOrderAlertQueuedAt: new Date() } });
}

async function finish(item, status, reason = '', staffId = null) {
  await Delivery.updateOne({ _id: item._id, status: 'sending' }, {
    $set: { status, reason, staffId, finishedAt: new Date() },
  });
}

async function send(item, config) {
  const [order, task] = await Promise.all([
    Order.findById(item.orderId).lean(),
    FollowUp.findById(item.taskId).lean(),
  ]);
  if (!activeCustomerOrder(order, config.startAt) || !task ||
      task.sourceType !== 'order' || !same(task.sourceOrderId, order._id) ||
      !ACTIVE_TASKS.includes(task.status) || !task.assignedTo)
    return finish(item, 'skipped', 'order_not_pending');

  const [patient, staff] = await Promise.all([
    User.findById(order.user).select('assignedHealthPlanner tenantId isDeleted').lean(),
    Admin.findById(task.assignedTo).select('role staffStatus mustChangePassword tenantId').lean(),
  ]);
  if (!patient || patient.isDeleted || !staff || staff.role !== 'healthPlanner' ||
      staff.staffStatus !== 'active' || staff.mustChangePassword ||
      !same(patient.assignedHealthPlanner, staff._id) ||
      !same(order.tenantId, patient.tenantId) || !same(staff.tenantId, patient.tenantId))
    return finish(item, 'skipped', 'assignee_unavailable');

  const link = await Link.findOne({ staffId: staff._id, tenantId: staff.tenantId || null,
    corpId: process.env.WECOM_CORP_ID }).lean();
  if (!link?.userId) return finish(item, 'skipped', 'wecom_not_linked', staff._id);

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
        text: { content: `您有新的客户服务订单待处理，请登录嘉医汇医护端首页查看“用户下单服务进程”。\n${config.origin}/` } }),
    });
    const result = await response.json();
    if (!response.ok || result.errcode || result.invaliduser) throw new Error('send_failed');
    await finish(item, 'sent', '', staff._id);
  } catch (error) {
    await finish(item, 'failed', String(error.message || 'send_failed').slice(0, 80), staff._id);
    console.error('[wecom-order-alert] delivery failed', String(item._id));
  }
}

async function tick() {
  const config = settings();
  if (running || !config) return;
  running = true;
  try {
    // Keyset scan revisits paid orders awaiting task creation without allowing
    // an older unassigned order to block later orders.
    const orders = await Order.find({ paymentStatus: 'paid', paidAt: { $gte: config.startAt },
      initiationSource: { $in: ['customer', '', null] }, status: { $in: ['pending', 'scheduled'] },
      tradeStatus: { $in: ACTIVE_TRADES }, refundStatus: { $in: ACTIVE_REFUNDS },
      wecomOrderAlertQueuedAt: null, ...(scanCursor ? { _id: { $gt: scanCursor } } : {}) })
      .sort({ _id: 1 }).limit(100).select('_id user tenantId').lean();
    scanCursor = orders.length === 100 ? orders.at(-1)._id : null;
    if (orders.length) {
      const tasks = await FollowUp.find({ sourceType: 'order', sourceOrderId: { $in: orders.map(order => order._id) },
        status: { $in: ACTIVE_TASKS }, assignedTo: { $ne: null } })
        .sort({ createdAt: 1 }).select('_id sourceOrderId assignedTo').lean();
      const plannerIds = [...new Set(tasks.map(task => String(task.assignedTo)))];
      const planners = plannerIds.length ? await Admin.find({ _id: { $in: plannerIds }, role: 'healthPlanner',
        staffStatus: 'active' }).select('_id').lean() : [];
      const validPlannerIds = new Set(planners.map(staff => String(staff._id)));
      const patients = await User.find({ _id: { $in: orders.map(order => order.user) }, isDeleted: { $ne: true } })
        .select('_id assignedHealthPlanner tenantId').lean();
      const patientById = new Map(patients.map(patient => [String(patient._id), patient]));
      for (const order of orders) {
        const patient = patientById.get(String(order.user));
        const task = patient && same(order.tenantId, patient.tenantId) && tasks.find(row =>
          same(row.sourceOrderId, order._id) && same(row.assignedTo, patient.assignedHealthPlanner) &&
          validPlannerIds.has(String(row.assignedTo)));
        if (task) await enqueue(order._id, task._id);
      }
    }
    const pending = await Delivery.find({ status: 'queued' }).sort({ createdAt: 1 }).limit(50).lean();
    for (const candidate of pending) {
      const item = await Delivery.findOneAndUpdate({ _id: candidate._id, status: 'queued' },
        { $set: { status: 'sending', claimedAt: new Date() } }, { new: true }).lean();
      if (!item) continue;
      try { await send(item, config); }
      catch (error) {
        await Delivery.updateOne({ _id: item._id, status: 'sending' },
          { $set: { status: 'failed', reason: 'processing_failed', finishedAt: new Date() } });
        console.error('[wecom-order-alert] processing failed', String(item._id), error.message);
      }
    }
  } finally { running = false; }
}

function start() {
  if (!settings()) return;
  const run = () => tick().catch(error => console.error('[wecom-order-alert] scan failed', error.message));
  setImmediate(run);
  const timer = setInterval(run, 10000);
  timer.unref();
}

module.exports = { settings, tick, start, activeCustomerOrder };
