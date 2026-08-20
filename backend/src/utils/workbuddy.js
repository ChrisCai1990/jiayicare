const https = require('https');

function configured() {
  return Boolean(process.env.WORKBUDDY_API_URL && process.env.WORKBUDDY_API_KEY && process.env.WORKBUDDY_AGENT_ID);
}

function postJson(url, body, headers = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = JSON.stringify(body);
    const req = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { data = { raw }; }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(data.message || data.error || `WorkBuddy API ${res.statusCode}`));
        resolve(data);
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('WorkBuddy API 请求超时')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// WorkBuddy Enterprise 控制台的“开发集成 → API 集成”会为具体 Agent 提供调用地址。
// 该适配器把厂商协议限制在一个文件内；业务层只传 session、消息、资料快照和附件。
async function runAgent({ sessionId, message, context, attachments = [] }) {
  if (!configured()) throw new Error('WorkBuddy 尚未配置，请设置 WORKBUDDY_API_URL、WORKBUDDY_API_KEY 和 WORKBUDDY_AGENT_ID');
  const publicOrigin = String(process.env.PUBLIC_API_ORIGIN || '').replace(/\/$/, '');
  const normalizedAttachments = attachments.map(file => ({
    ...file,
    url: file.url?.startsWith('/') && publicOrigin ? `${publicOrigin}${file.url}` : file.url,
  }));
  const result = await postJson(process.env.WORKBUDDY_API_URL, {
    agent_id: process.env.WORKBUDDY_AGENT_ID,
    session_id: sessionId,
    input: message,
    context,
    attachments: normalizedAttachments,
  }, { Authorization: `Bearer ${process.env.WORKBUDDY_API_KEY}` });
  return {
    sessionId: result.session_id || result.sessionId || sessionId,
    content: result.output || result.answer || result.message?.content || result.content || '',
    files: result.files || result.artifacts || [],
    raw: result,
  };
}

module.exports = { configured, runAgent };
