const https = require('https');

const QWEN_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEEPSEEK_BASE = 'https://api.deepseek.com/v1';

function getKey(provider) {
  if (provider === 'deepseek') return process.env.DEEPSEEK_API_KEY;
  return process.env.QWEN_API_KEY;
}

function getBase(provider) {
  return provider === 'deepseek' ? DEEPSEEK_BASE : QWEN_BASE;
}

// 选择可用的模型提供方（主：通义千问，备：DeepSeek）
function selectProvider() {
  if (process.env.QWEN_API_KEY) return 'qwen';
  if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
  return null;
}

// HTTP POST 工具（避免额外依赖）
function httpPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 通用文本对话
async function chat(messages, { systemPrompt, maxTokens = 2000, provider } = {}) {
  const p = provider || selectProvider();
  if (!p) throw new Error('未配置 AI API Key（QWEN_API_KEY 或 DEEPSEEK_API_KEY）');

  const model = p === 'deepseek' ? 'deepseek-chat' : 'qwen-plus';
  const msgs = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;

  const result = await httpPost(
    `${getBase(p)}/chat/completions`,
    { Authorization: `Bearer ${getKey(p)}` },
    { model, messages: msgs, max_tokens: maxTokens }
  );

  if (result.error) throw new Error(result.error.message);
  return result.choices?.[0]?.message?.content || '';
}

// OCR + 视觉理解（仅通义千问支持，图片 base64 或 URL）
// model 默认 qwen-vl-max；体检报告逐页识别用 qwen-vl-plus（实测快约2.8倍且精度一致）
async function parseImage(imageSource, prompt, { isUrl = false, model = 'qwen-vl-max', maxTokens = 3000 } = {}) {
  const key = process.env.QWEN_API_KEY;
  if (!key) throw new Error('图像解析需要 QWEN_API_KEY');

  const imageContent = isUrl
    ? { type: 'image_url', image_url: { url: imageSource } }
    : { type: 'image_url', image_url: { url: `data:image/png;base64,${imageSource.replace(/^data:[^;]+;base64,/, '')}` } };

  const result = await httpPost(
    `${QWEN_BASE}/chat/completions`,
    { Authorization: `Bearer ${key}` },
    {
      model,
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: prompt }] }],
      max_tokens: maxTokens,
    }
  );

  if (result.error) throw new Error(result.error.message);
  return result.choices?.[0]?.message?.content || '';
}

// 调用日志记录（写入 console，后续接日志模块）
function logCall(provider, model, tokensUsed, durationMs, success) {
  console.log(JSON.stringify({ t: new Date().toISOString(), provider, model, tokens: tokensUsed, ms: durationMs, ok: success }));
}

module.exports = { chat, parseImage, selectProvider };
