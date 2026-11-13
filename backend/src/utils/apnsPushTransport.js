const http2 = require('node:http2');
const { createPrivateKey, sign } = require('node:crypto');
const { readFileSync } = require('node:fs');

// APNs receives only a generic service alert and an absolute unread count.
// Neither health content nor account IDs belong in a lock-screen notification.
function createApnsPushTransport({ keyId, teamId, privateKeyPath,
  topic = 'com.jiayicare.app', connect = http2.connect, now = Date.now,
  loadKey = () => readFileSync(privateKeyPath), timeoutMs = 10000 }) {
  let jwt, issuedAt = 0;
  function authorization() {
    if (!/^[A-Z0-9]{10}$/.test(keyId || '') || !/^[A-Z0-9]{10}$/.test(teamId || '')
      || topic !== 'com.jiayicare.app') throw new Error('苹果推送配置未完成');
    const seconds = Math.floor(now() / 1000);
    if (!jwt || seconds < issuedAt || seconds - issuedAt >= 1200) {
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const input = `${encode({ alg: 'ES256', kid: keyId })}.${encode({ iss: teamId, iat: seconds })}`;
      const key = createPrivateKey(loadKey());
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
        throw new Error('苹果推送签名配置无效');
      }
      jwt = `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
      issuedAt = seconds;
    }
    return jwt;
  }
  return {
    async send({ token, messageId, count }) {
      if ((!/^[a-f0-9]{2,512}$/i.test(token || '') || token.length % 2 !== 0) || !/^[a-f0-9]{24}$/i.test(String(messageId))
        || !Number.isInteger(count) || count < 0) throw new Error('苹果通知参数无效');
      let auth;
      try { auth = authorization(); } catch { throw new Error('苹果推送签名配置无效'); }
      return new Promise((resolve, reject) => {
        let client, request, timer, finished = false;
        const finish = error => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          request?.close();
          client?.destroy();
          if (error) reject(new Error('苹果推送未确认接收'));
          else resolve({ accepted: true });
        };
        try {
          // Store and TestFlight builds both use production APNs, never sandbox.
          client = connect('https://api.push.apple.com');
          client.on('error', () => finish(true));
          client.on('close', () => finish(true));
          timer = setTimeout(() => finish(true), timeoutMs);
          request = client.request({ ':method': 'POST', ':path': `/3/device/${token}`,
            authorization: `bearer ${auth}`, 'apns-topic': topic,
            'apns-push-type': 'alert', 'apns-priority': '10',
            'apns-expiration': String(Math.floor(now() / 1000) + 300),
            'apns-collapse-id': String(messageId),
          });
          let status;
          request.on('response', headers => { status = headers[':status']; });
          request.on('data', () => {}); // Do not log upstream bodies or tokens.
          request.on('error', () => finish(true));
          request.on('end', () => { if (status === 403) jwt = null; finish(status !== 200); });
          request.end(JSON.stringify({ aps: { alert: { title: '嘉医汇健康管家',
            body: '您有新的服务消息，请打开 App 查看。' }, badge: Math.min(99, count), sound: 'default' },
            kind: 'service-message' }));
        } catch { finish(true); }
      });
    },
  };
}
module.exports = { createApnsPushTransport };

