const https = require('https');
const User = require('../models/User');
const Payment = require('../models/Payment');

let cachedToken = '';
let tokenExpiresAt = 0;

function jsonRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const raw = body == null ? '' : JSON.stringify(body);
    const req = https.request({ hostname: parsed.hostname, path: parsed.pathname + parsed.search, method, timeout: 15000, headers: raw ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(raw) } : {} }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data || '{}');
          if (result.errcode) return reject(new Error(`微信订单履约上报失败(${result.errcode})：${result.errmsg}`));
          resolve(result);
        } catch (err) { reject(err); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('微信订单履约请求超时')));
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

async function accessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const appid = process.env.WECHAT_MP_APPID;
  const secret = process.env.WECHAT_MP_SECRET;
  if (!appid || !secret) throw new Error('缺少微信小程序 AppID/Secret');
  const result = await jsonRequest('GET', `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`);
  cachedToken = result.access_token;
  tokenExpiresAt = Date.now() + Math.max(60, Number(result.expires_in || 7200) - 300) * 1000;
  return cachedToken;
}

function logisticsType(type) {
  if (type === 'delivery_and_service') return 1; // 快递配送
  if (type === 'offline_service') return 4; // 到店/线下交付
  return 3; // 无实体物流的远程人工或长期服务
}

async function reportOrderFulfillment(order, fulfillment) {
  const [payment, user] = await Promise.all([
    Payment.findOne({ order: order._id, status: 'succeeded', channel: 'wechat_pay' }).sort({ createdAt: -1 }),
    User.findById(order.user).select('wechatMpOpenid'),
  ]);
  if (!payment?.transactionId) throw new Error('订单缺少微信支付交易号，不能上报履约');
  if (!user?.wechatMpOpenid) throw new Error('订单用户缺少小程序 OpenID，不能上报履约');
  const type = logisticsType(fulfillment.type || order.fulfillmentType);
  if (type === 1 && (!fulfillment.trackingNo || !fulfillment.deliveryCompany)) {
    throw new Error('配送订单必须填写物流公司编码和物流单号');
  }
  const shipping = { item_desc: String(order.serviceName || '健康服务').slice(0, 120) };
  if (type === 1) {
    shipping.tracking_no = fulfillment.trackingNo;
    shipping.express_company = fulfillment.deliveryCompany;
  }
  const token = await accessToken();
  await jsonRequest('POST', `https://api.weixin.qq.com/wxa/sec/order/upload_shipping_info?access_token=${encodeURIComponent(token)}`, {
    order_key: { order_number_type: 2, transaction_id: payment.transactionId },
    logistics_type: type,
    delivery_mode: 1,
    is_all_delivered: true,
    shipping_list: [shipping],
    upload_time: new Date().toISOString(),
    payer: { openid: user.wechatMpOpenid },
  });
  fulfillment.wechatDeliveryStatus = 'reported';
  fulfillment.wechatDeliveryReportedAt = new Date();
  await fulfillment.save();
  return fulfillment;
}

module.exports = { reportOrderFulfillment, logisticsType };
