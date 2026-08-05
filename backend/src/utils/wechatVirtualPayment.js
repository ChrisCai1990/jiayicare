const crypto = require('crypto');
const https = require('https');

const PAYMENT_METHOD = 'requestVirtualPayment';

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      let body = '';
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error('微信登录响应格式异常')); }
      });
    }).on('error', reject);
  });
}

function getConfig() {
  const env = Number(process.env.WECHAT_VIRTUAL_PAY_ENV || 1);
  const offerId = process.env.WECHAT_VIRTUAL_PAY_OFFER_ID;
  const appKey = env === 0
    ? process.env.WECHAT_VIRTUAL_PAY_APP_KEY
    : process.env.WECHAT_VIRTUAL_PAY_SANDBOX_APP_KEY;
  if (!offerId || !appKey) throw new Error('微信小程序虚拟支付尚未完成配置');
  return { env, offerId, appKey };
}

async function exchangeLoginCode(code) {
  if (!code) throw new Error('缺少本次支付所需的微信登录凭证');
  const appid = process.env.WECHAT_MP_APPID;
  const secret = process.env.WECHAT_MP_SECRET;
  if (!appid || !secret) throw new Error('微信小程序登录尚未完成配置');
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const data = await httpsGetJson(url);
  if (data.errcode || !data.session_key) {
    throw new Error(`微信支付登录校验失败：${data.errmsg || data.errcode || '未返回 session_key'}`);
  }
  return data;
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

function buildPaymentPayload({ sessionKey, productId, goodsPrice, outTradeNo, attach = '' }) {
  const { env, offerId, appKey } = getConfig();
  const signData = JSON.stringify({
    offerId,
    buyQuantity: 1,
    env,
    currencyType: 'CNY',
    productId: String(productId).replace(/[^0-9A-Za-z_\-|*@]/g, '-').slice(0, 64),
    goodsPrice: Math.round(Number(goodsPrice)),
    outTradeNo,
    attach: String(attach).slice(0, 128),
  });
  return {
    mode: 'short_series_goods',
    signData,
    paySig: hmac(appKey, `${PAYMENT_METHOD}&${signData}`),
    signature: hmac(sessionKey, signData),
    environment: env === 0 ? 'production' : 'sandbox',
  };
}

module.exports = { getConfig, exchangeLoginCode, buildPaymentPayload };
