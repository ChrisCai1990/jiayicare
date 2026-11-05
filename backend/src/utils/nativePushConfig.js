function huaweiPushReady() {
  return process.env.NATIVE_PUSH_ENABLED === 'true'
    && process.env.HUAWEI_PUSH_CLIENT_ID === '119164097'
    && typeof process.env.HUAWEI_PUSH_CLIENT_SECRET === 'string'
    && process.env.HUAWEI_PUSH_CLIENT_SECRET.trim().length > 0;
}
function apnsPushReady() {
  return process.env.NATIVE_PUSH_ENABLED === 'true' && process.env.IOS_PUSH_ENABLED === 'true'
    && /^[A-Z0-9]{10}$/.test(process.env.APNS_KEY_ID || '')
    && /^[A-Z0-9]{10}$/.test(process.env.APNS_TEAM_ID || '')
    && typeof process.env.APNS_PRIVATE_KEY_PATH === 'string'
    && process.env.APNS_PRIVATE_KEY_PATH.startsWith('/');
}
function nativePushReady(provider) {
  if (provider === 'huawei') return huaweiPushReady();
  if (provider === 'apns') return apnsPushReady();
  if (provider !== undefined) return false;
  return huaweiPushReady() || apnsPushReady();
}
module.exports = { nativePushReady, apnsPushReady, huaweiPushReady };
