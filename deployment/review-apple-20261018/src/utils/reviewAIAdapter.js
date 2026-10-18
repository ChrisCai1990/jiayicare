// Dormant transport: callers must explicitly inject this into the review budget
// gateway after independent credentials and a verified cost estimator are ready.
// Never imports production model configuration or credentials.
const ENDPOINT = 'https://ws-c30pv4x24nuz8jor.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions';
const MODEL = 'qwen-plus-2025-12-01';

function requestBody(payload) {
  if (!payload || !Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 16) {
    throw new Error('审核AI消息数量无效');
  }
  const messages = payload.messages.map(message => {
    if (!message || !['system', 'user', 'assistant'].includes(message.role)
      || typeof message.content !== 'string' || !message.content.trim()) throw new Error('审核AI仅支持文字消息');
    return { role: message.role, content: message.content };
  });
  const body = { model: MODEL, messages, stream: false, enable_thinking: false,
    enable_search: false, max_tokens: 512, n: 1, response_format: { type: 'json_object' } };
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 32768) throw new Error('审核AI输入过长');
  return body;
}

function createReviewAIAdapter({ apiKey, estimateMaximumCostFen, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)
    || typeof estimateMaximumCostFen !== 'function' || typeof fetchImpl !== 'function') {
    throw new Error('审核AI独立凭据或计费估算器未配置');
  }
  return {
    async maximumCostFen(payload) {
      // Estimator is a trusted local dependency, never an HTTP-request field.
      const cost = await estimateMaximumCostFen(requestBody(payload));
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new Error('审核AI费用上界无效');
      return cost;
    },
    async invoke(payload, { signal } = {}) {
      if (!signal || signal.aborted) throw new Error('审核AI请求已取消');
      try {
        const response = await fetchImpl(ENDPOINT, {
          method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody(payload)),
        });
        if (!response.ok) {
          let providerReason = 'UNKNOWN';
          if (response.body) {
            const reader = response.body.getReader(); let bytes = 0; const chunks = [];
            try {
              for (;;) { const next = await reader.read(); if (next.done) break; bytes += next.value.byteLength; if (bytes > 4096) break; chunks.push(Buffer.from(next.value)); }
              const detail = JSON.parse(Buffer.concat(chunks).toString('utf8'));
              const value = detail.error?.code || detail.code;
              if (/^[A-Za-z][A-Za-z0-9_.-]{0,60}$/.test(value || '')) providerReason = value;
            } catch {} finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
          }
          throw Object.assign(new Error('provider response'), { code: `REVIEW_HTTP_${response.status}`, providerReason });
        }
        if (!response.body) throw Object.assign(new Error('empty response'), { code: 'REVIEW_RESPONSE_EMPTY' });
        // Bound even chunked or dishonest Content-Length responses.
        const reader = response.body.getReader();
        const chunks = []; let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65536) { await reader.cancel(); throw new Error('response too large'); }
            chunks.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const choice = data.choices?.[0];
        const content = choice?.message?.content;
        if (signal.aborted || choice?.finish_reason !== 'stop'
          || typeof content !== 'string' || !content.trim() || content.length > 4000) throw Object.assign(new Error('invalid reply'), { code: 'REVIEW_RESPONSE_INVALID' });
        return content.trim();
      } catch (error) {
        // Never expose supplier bodies, credentials or submitted content.
        throw Object.assign(new Error('审核AI服务暂不可用'), { code: /^REVIEW_(HTTP_[1-5]\d\d|RESPONSE_EMPTY|RESPONSE_INVALID)$/.test(error.code || '') ? error.code : 'REVIEW_TRANSPORT_FAILED', providerReason: error.providerReason || 'UNKNOWN' });
      }
    },
  };
}
module.exports = { createReviewAIAdapter, requestBody, MODEL, ENDPOINT };
