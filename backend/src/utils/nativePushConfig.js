function nativePushReady() {
  return process.env.NATIVE_PUSH_ENABLED === 'true'
    && process.env.HUAWEI_PUSH_CLIENT_ID === '119164097'
    && typeof process.env.HUAWEI_PUSH_CLIENT_SECRET === 'string'
    && process.env.HUAWEI_PUSH_CLIENT_SECRET.trim().length > 0;
}
module.exports = { nativePushReady };
