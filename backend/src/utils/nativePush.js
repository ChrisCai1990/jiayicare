const { createPushDeviceRegistry } = require('./pushDeviceRegistry');
const { createHuaweiPushTransport } = require('./huaweiPushTransport');
const { createNativePushDispatch } = require('./nativePushDispatch');
const { nativePushReady: enabled } = require('./nativePushConfig');
let dispatcher;
function getDispatcher() {
  if (!dispatcher) dispatcher = createNativePushDispatch({
    enabled,
    Job: require('../models/NativePushJob'), Message: require('../models/Message'), User: require('../models/User'),
    unreadCount: async userId => (await require('./getUnreadSummary').getUnreadSummary(userId)).count,
    registry: createPushDeviceRegistry({ Device: require('../models/PushDevice'), Session: require('../models/LoginSession'), enabled }),
    transport: createHuaweiPushTransport({ clientId: process.env.HUAWEI_PUSH_CLIENT_ID, clientSecret: process.env.HUAWEI_PUSH_CLIENT_SECRET }),
  });
  return dispatcher;
}
async function enqueueNativePush(message) {
  if (!enabled()) return;
  try { await getDispatcher().enqueue(message); }
  catch { console.warn('[native-push] queue write failed'); }
}
let timer;
function startNativePush() {
  if (!enabled() || timer) return;
  let busy = false;
  timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try { await getDispatcher().tick(); }
    catch { console.warn('[native-push] worker failed'); }
    finally { busy = false; }
  }, 5000);
  timer.unref();
}
module.exports = { enqueueNativePush, startNativePush };
