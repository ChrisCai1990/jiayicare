function createStaffPushTransport({ clientId, clientSecret, fetchImpl = global.fetch, now = Date.now }) {
  let credential;
  let expiresAt = 0;
  let refreshing;
  async function post(url, body, headers) {
    const response = await fetchImpl(url, { method: 'POST', headers, body,
      signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw new Error('医护推送上游未接受请求');
    return response.json();
  }
  async function accessToken() {
    if (!/^\d+$/.test(clientId || '') || !clientSecret) throw new Error('医护推送配置不完整');
    if (credential && now() < expiresAt) return credential;
    if (!refreshing) refreshing = (async () => {
      const result = await post('https://oauth-login.cloud.huawei.com/oauth2/v3/token',
        new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId,
          client_secret: clientSecret }).toString(),
        { 'Content-Type': 'application/x-www-form-urlencoded' });
      if (!result.access_token || !Number.isFinite(Number(result.expires_in))) {
        throw new Error('医护推送授权失败');
      }
      credential = result.access_token;
      expiresAt = now() + Math.max(0, Number(result.expires_in) - 120) * 1000;
      return credential;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  return {
    async send(token, unreadCount = 0, body = '您有新的客户消息，请打开应用查看。') {
      if (!token || typeof token !== 'string') throw new Error('设备推送凭据无效');
      const auth = await accessToken();
      const count = Math.max(0, Math.min(99, Number(unreadCount) || 0));
      const result = await post(`https://push-api.cloud.huawei.com/v1/${clientId}/messages:send`,
        JSON.stringify({ validate_only: false, message: {
          token: [token],
          notification: { title: '嘉医汇医护', body },
          android: { ttl: '300s', category: 'IM', notification: {
            click_action: { type: 3 },
            badge: { class: 'com.jiayicare.staff.pilot.MainActivity', set_num: count },
          } },
        } }),
        { 'Content-Type': 'application/json', Authorization: `Bearer ${auth}` });
      if (String(result.code) !== '80000000') throw new Error('医护推送上游未确认投递');
      return { accepted: true };
    },
  };
}
module.exports = { createStaffPushTransport };
