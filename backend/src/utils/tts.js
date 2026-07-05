const https = require('https');
const { uploadBase64 } = require('./oss');

// 判断是否启用真实语音合成（需配置3个环境变量：AppKey + 复用OSS的AK/SK获取Token）
function ttsEnabled() {
  return !!(process.env.NLS_APP_KEY && process.env.ALIYUN_SMS_KEY_ID && process.env.ALIYUN_SMS_KEY_SECRET);
}

// 用 AK/SK 通过阿里云 Token 服务（RPC风格）换取 NLS 调用令牌（复用短信的 AK/SK，避免新增一套密钥）
// 直接构造签名请求调用 CreateToken，不依赖专用 SDK 包（该接口无独立 npm SDK，官方文档即示例直接HTTP调用）
function fetchNlsToken() {
  const crypto = require('crypto');
  const accessKeyId = process.env.ALIYUN_SMS_KEY_ID;
  const accessKeySecret = process.env.ALIYUN_SMS_KEY_SECRET;

  const params = {
    AccessKeyId: accessKeyId,
    Action: 'CreateToken',
    Version: '2019-02-28',
    Format: 'JSON',
    RegionId: 'cn-shanghai',
    SignatureMethod: 'HMAC-SHA1',
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
  };

  const encode = (s) => encodeURIComponent(s).replace(/\*/g, '%2A').replace(/%7E/g, '~');
  const sortedKeys = Object.keys(params).sort();
  const canonicalQuery = sortedKeys.map(k => `${encode(k)}=${encode(params[k])}`).join('&');
  const stringToSign = `GET&${encode('/')}&${encode(canonicalQuery)}`;
  const signature = crypto.createHmac('sha1', accessKeySecret + '&').update(stringToSign).digest('base64');

  const query = `${canonicalQuery}&Signature=${encode(signature)}`;
  return new Promise((resolve, reject) => {
    https.get(`https://nls-meta.cn-shanghai.aliyuncs.com/?${query}`, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.Token && parsed.Token.Id) resolve(parsed.Token.Id);
          else reject(new Error(`获取语音合成Token失败: ${data.slice(0, 200)}`));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// 调用阿里云智能语音交互 - 语音合成 RESTful API，返回音频 Buffer
function synthesizeAudio(text, token) {
  return new Promise((resolve, reject) => {
    const appKey = process.env.NLS_APP_KEY;
    const params = new URLSearchParams({
      appkey: appKey,
      token,
      text,
      format: 'mp3',
      sample_rate: '16000',
      voice: 'zhixiaobai',
    });
    const url = `https://nls-gateway-cn-shanghai.aliyuncs.com/stream/v1/tts?${params.toString()}`;
    https.get(url, (res) => {
      const contentType = res.headers['content-type'] || '';
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (contentType.includes('audio/mpeg')) resolve(buf);
        else reject(new Error(`语音合成失败: ${buf.toString('utf8').slice(0, 200)}`));
      });
    }).on('error', reject);
  });
}

// 文本转语音，生成的 mp3 上传 OSS，返回 { url }
async function synthesize(text) {
  if (!ttsEnabled()) throw new Error('语音合成服务未配置');
  if (!text || !text.trim()) throw new Error('缺少朗读文本');

  const token = await fetchNlsToken();
  const audioBuffer = await synthesizeAudio(text.slice(0, 2000), token);
  const base64 = audioBuffer.toString('base64');
  const { url } = await uploadBase64(`data:audio/mpeg;base64,${base64}`, 'audio/mpeg', 'tts');
  return { url };
}

module.exports = { synthesize, ttsEnabled };
