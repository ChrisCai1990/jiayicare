const OpenApi = require('@alicloud/openapi-client');
const SystemConfig = require('../models/SystemConfig');

function dailyLimit() {
  const value = Number(process.env.ALIYUN_NUMBER_AUTH_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 && value <= 10000 ? value : 0;
}

function enabled() {
  return process.env.ALIYUN_NUMBER_AUTH_ENABLED === 'true'
    && !!process.env.ALIYUN_NUMBER_AUTH_KEY_ID
    && !!process.env.ALIYUN_NUMBER_AUTH_KEY_SECRET
    && dailyLimit() > 0;
}

async function reserveDailyAttempt() {
  const day = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const key = `numberAuthDaily:${day}`;
  // A failed carrier request still consumes one allowance, conservatively bounding spend.
  try {
    await SystemConfig.updateOne({ key }, { $setOnInsert: { value: { count: 0 }, label: '号码认证每日请求上限' } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  const row = await SystemConfig.findOneAndUpdate(
    { key, 'value.count': { $lt: dailyLimit() } },
    { $inc: { 'value.count': 1 } },
    { new: true },
  );
  if (!row) throw new Error('NUMBER_AUTH_DAILY_LIMIT');
}

async function getAuthorizedMobile(accessToken) {
  if (!enabled()) throw new Error('NUMBER_AUTH_DISABLED');
  if (typeof accessToken !== 'string' || accessToken.length < 16 || accessToken.length > 8192 || /\s/.test(accessToken)) {
    throw new Error('NUMBER_AUTH_BAD_TOKEN');
  }
  await reserveDailyAttempt();
  // The carrier token is obtained only after consent on the Android SDK page.
  // Never trust a phone number supplied by the client and never log this token.
  const Dypnsapi = require('@alicloud/dypnsapi20170525');
  const client = new Dypnsapi.default(new OpenApi.Config({
    accessKeyId: process.env.ALIYUN_NUMBER_AUTH_KEY_ID,
    accessKeySecret: process.env.ALIYUN_NUMBER_AUTH_KEY_SECRET,
    endpoint: 'dypnsapi.aliyuncs.com',
  }));
  const result = await client.getMobile(new Dypnsapi.GetMobileRequest({ accessToken }));
  const body = result?.body;
  const phone = body?.getMobileResultDTO?.mobile;
  if (body?.code !== 'OK' || !/^1[3-9]\d{9}$/.test(String(phone || ''))) throw new Error('NUMBER_AUTH_GET_MOBILE_FAILED');
  return phone;
}

module.exports = { enabled, dailyLimit, getAuthorizedMobile };
