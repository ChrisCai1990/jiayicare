const { createPushDeviceRegistry } = require('./pushDeviceRegistry');
const { createHuaweiPushTransport } = require('./huaweiPushTransport');
const { createApnsPushTransport } = require('./apnsPushTransport');
const { createNativePushDispatch } = require('./nativePushDispatch');
const { nativePushReady: enabled } = require('./nativePushConfig');
let dispatcher;
function getDispatcher() {
  if (!dispatcher) {
    const transports = {
      huawei: createHuaweiPushTransport({ clientId: process.env.HUAWEI_PUSH_CLIENT_ID, clientSecret: process.env.HUAWEI_PUSH_CLIENT_SECRET }),
      apns: createApnsPushTransport({ keyId: process.env.APNS_KEY_ID, teamId: process.env.APNS_TEAM_ID,
        privateKeyPath: process.env.APNS_PRIVATE_KEY_PATH }),
    };
    dispatcher = createNativePushDispatch({
    enabled,
    Job: require('../models/NativePushJob'), Message: require('../models/Message'), User: require('../models/User'),
    unreadCount: async userId => (await require('./getUnreadSummary').getUnreadSummary(userId)).count,
    registry: createPushDeviceRegistry({ Device: require('../models/PushDevice'), Session: require('../models/LoginSession'), enabled }),
    transport: { async send(input) {
      if (!enabled(input.provider) || !transports[input.provider]) throw new Error('通知通道尚未开放');
      return transports[input.provider].send(input);
    } },
  });
  }
  return dispatcher;
}
async function enqueueNativePush(message, deliveryKey) {
  if (!enabled()) return;
  try { await getDispatcher().enqueue(message, deliveryKey); }
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
