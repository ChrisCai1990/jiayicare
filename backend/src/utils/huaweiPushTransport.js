// Credentials remain server-only. Never log upstream bodies or device tokens.
function createHuaweiPushTransport({ clientId, clientSecret, fetchImpl = global.fetch, now = Date.now }) {
  let credential, expiresAt = 0, refreshing;
  async function post(url, body, headers) {
    try {
      const res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!res.ok) throw new Error();
      return await res.json();
    } catch { throw new Error('华为推送网络请求失败'); }
  }
  async function accessToken() {
    if (!/^\d+$/.test(clientId || '') || !clientSecret) throw new Error('华为推送服务端配置未完成');
    if (credential && now() < expiresAt) return credential;
    if (!refreshing) refreshing = (async () => {
      const result = await post('https://oauth-login.cloud.huawei.com/oauth2/v3/token',
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
        { 'Content-Type': 'application/x-www-form-urlencoded' });
      if (typeof result.access_token !== 'string' || !result.access_token || !(Number(result.expires_in) > 60)) {
        throw new Error('华为推送鉴权失败');
      }
      credential = result.access_token;
      expiresAt = now() + (Number(result.expires_in) - 60) * 1000;
      return credential;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  return {
    async send({ token, messageId, count = 0 }) {
      if (typeof token !== 'string' || !token || token.length > 4096 || /[\s\x00-\x1f\x7f]/.test(token)
        || !/^[a-f0-9]{24}$/i.test(String(messageId))) throw new Error('通知参数无效');
      const auth = await accessToken();
      const result = await post(`https://push-api.cloud.huawei.com/v1/${clientId}/messages:send`, JSON.stringify({
        validate_only: false,
        message: {
          token: [token],
          notification: { title: '嘉医汇健康管家', body: '您有一条新的服务消息，请打开App查看。' },
          android: {
            ttl: '300s',
            notification: { click_action: { type: 3 }, category: 'IM', tag: String(messageId),
              badge: { class: 'com.jiayicare.app.MainActivity', set_num: Math.max(0, Math.min(99, Math.floor(Number(count) || 0))) } },
          },
        },
      }), { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` });
      if (String(result.code) !== '80000000') {
        credential = null;
        throw new Error('华为推送未确认接收');
      }
      return { accepted: true }; // Provider acceptance is not device delivery.
    },
  };
}
module.exports = { createHuaweiPushTransport };
