const https = require('https');

const ENTRY_SOURCES = {
  official_site: '官网服务入口',
  wechat_service: '微信客服',
  partner: '合作机构转介',
};

let tokenCache = { value: '', expiresAt: 0 };

function request(url, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request(url, {
      method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : undefined,
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, contentType: res.headers['content-type'] || '', body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('微信小程序码请求超时')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function accessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const appid = String(process.env.WECHAT_MP_APPID || '').trim();
  const secret = String(process.env.WECHAT_MP_SECRET || '').trim();
  if (!appid || !secret) throw new Error('未配置小程序码生成凭据');
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const response = await request(url);
  const data = JSON.parse(response.body.toString('utf8') || '{}');
  if (!data.access_token) throw new Error(data.errmsg || '获取微信访问令牌失败');
  tokenCache = { value: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 120) * 1000 };
  return tokenCache.value;
}

async function entryCode(source) {
  const sourceKey = String(source || '').trim().toLowerCase();
  if (!ENTRY_SOURCES[sourceKey]) throw new Error('不支持的来源码');
  const token = await accessToken();
  const response = await request(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`, {
    method: 'POST',
    body: {
      scene: `source=${sourceKey}`,
      page: 'pages/home/index',
      check_path: true,
      env_version: 'release',
      width: 430,
      auto_color: false,
      line_color: { r: 0, g: 0, b: 0 },
      is_hyaline: false,
    },
  });
  if (response.status < 200 || response.status >= 300 || !String(response.contentType).startsWith('image/')) {
    let message = '微信未返回小程序码';
    try { message = JSON.parse(response.body.toString('utf8')).errmsg || message; } catch {}
    throw new Error(message);
  }
  return { source: sourceKey, label: ENTRY_SOURCES[sourceKey], image: response.body };
}

module.exports = { ENTRY_SOURCES, entryCode };
