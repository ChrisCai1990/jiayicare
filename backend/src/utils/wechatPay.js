const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

const API_HOST = 'api.mch.weixin.qq.com';

function config() {
  const readPem = (inlineValue, filePath) => {
    if (inlineValue) return String(inlineValue).replace(/\\n/g, '\n');
    if (filePath) return fs.readFileSync(filePath, 'utf8');
    return '';
  };
  const value = {
    appid: process.env.WECHAT_MP_APPID,
    mchid: process.env.WECHAT_PAY_MCH_ID,
    serialNo: process.env.WECHAT_PAY_SERIAL_NO,
    privateKey: readPem(process.env.WECHAT_PAY_PRIVATE_KEY, process.env.WECHAT_PAY_PRIVATE_KEY_PATH),
    apiV3Key: process.env.WECHAT_PAY_API_V3_KEY,
    notifyUrl: process.env.WECHAT_PAY_NOTIFY_URL,
    refundNotifyUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL || process.env.WECHAT_PAY_NOTIFY_URL?.replace(/payment-notify$/, 'refund-notify'),
    platformPublicKey: readPem(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY, process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH),
  };
  const missing = ['appid', 'mchid', 'serialNo', 'privateKey', 'apiV3Key', 'notifyUrl'].filter(k => !value[k]);
  if (missing.length) throw new Error(`普通微信支付尚未配置：${missing.join(', ')}`);
  if (Buffer.byteLength(value.apiV3Key) !== 32) throw new Error('WECHAT_PAY_API_V3_KEY 必须为32字节');
  return value;
}

function nonce() { return crypto.randomBytes(16).toString('hex'); }

function sign(message, privateKey) {
  return crypto.sign('RSA-SHA256', Buffer.from(message), privateKey).toString('base64');
}

function authorization(method, path, body, cfg) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = nonce();
  const signature = sign(`${method}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`, cfg.privateKey);
  return `WECHATPAY2-SHA256-RSA2048 mchid="${cfg.mchid}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${cfg.serialNo}",signature="${signature}"`;
}

function apiRequest(method, path, payload) {
  const cfg = config();
  const body = payload == null ? '' : JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: API_HOST,
      port: 443,
      path,
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: authorization(method, path, body, cfg),
        'User-Agent': 'JiayiCare/1.0',
      },
      timeout: 15000,
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        const err = new Error(data.message || `微信支付请求失败(${res.statusCode})`);
        err.code = data.code || 'WECHAT_PAY_ERROR';
        err.response = data;
        reject(err);
      });
    });
    req.on('timeout', () => req.destroy(new Error('微信支付请求超时')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function createJsapiPayment({ description, outTradeNo, amount, openid, attach = '' }) {
  const cfg = config();
  if (!openid) throw new Error('当前账号未绑定小程序身份，请重新使用微信登录');
  const data = await apiRequest('POST', '/v3/pay/transactions/jsapi', {
    appid: cfg.appid,
    mchid: cfg.mchid,
    description: String(description).slice(0, 127),
    out_trade_no: outTradeNo,
    notify_url: cfg.notifyUrl,
    attach: String(attach).slice(0, 128),
    amount: { total: Math.round(Number(amount) * 100), currency: 'CNY' },
    payer: { openid },
  });
  return { prepayId: data.prepay_id, client: buildClientParams(data.prepay_id) };
}

function buildClientParams(prepayId) {
  const cfg = config();
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = nonce();
  const packageValue = `prepay_id=${prepayId}`;
  return { timeStamp, nonceStr, package: packageValue, signType: 'RSA', paySign: sign(`${cfg.appid}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`, cfg.privateKey) };
}

function queryOrder(outTradeNo) {
  const cfg = config();
  return apiRequest('GET', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(cfg.mchid)}`);
}

function closeOrder(outTradeNo) {
  const cfg = config();
  return apiRequest('POST', `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}/close`, { mchid: cfg.mchid });
}

function requestRefund({ outTradeNo, outRefundNo, amount, totalAmount, reason }) {
  const cfg = config();
  return apiRequest('POST', '/v3/refund/domestic/refunds', {
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    reason: String(reason || '用户申请退款').slice(0, 80),
    notify_url: cfg.refundNotifyUrl,
    amount: {
      refund: Math.round(Number(amount) * 100),
      total: Math.round(Number(totalAmount) * 100),
      currency: 'CNY',
    },
  });
}

function queryRefund(outRefundNo) {
  return apiRequest('GET', `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`);
}

async function downloadPlatformCertificates() {
  const data = await apiRequest('GET', '/v3/certificates');
  return (data.data || []).map(item => ({
    serialNo: item.serial_no,
    effectiveTime: item.effective_time,
    expireTime: item.expire_time,
    certificate: decryptResource(item.encrypt_certificate),
  }));
}

function verifyNotifySignature(headers, rawBody) {
  const cfg = config();
  if (!cfg.platformPublicKey) throw new Error('缺少 WECHAT_PAY_PLATFORM_PUBLIC_KEY，不能验证微信支付回调');
  const timestamp = headers['wechatpay-timestamp'];
  const nonceStr = headers['wechatpay-nonce'];
  const signature = headers['wechatpay-signature'];
  if (!timestamp || !nonceStr || !signature) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  return crypto.verify('RSA-SHA256', Buffer.from(`${timestamp}\n${nonceStr}\n${rawBody}\n`), cfg.platformPublicKey, Buffer.from(signature, 'base64'));
}

function decryptResource(resource) {
  const cfg = config();
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const data = ciphertext.subarray(0, ciphertext.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(cfg.apiV3Key), Buffer.from(resource.nonce));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(resource.associated_data || ''));
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

module.exports = {
  config,
  createJsapiPayment,
  buildClientParams,
  queryOrder,
  closeOrder,
  requestRefund,
  queryRefund,
  downloadPlatformCertificates,
  verifyNotifySignature,
  decryptResource,
};
