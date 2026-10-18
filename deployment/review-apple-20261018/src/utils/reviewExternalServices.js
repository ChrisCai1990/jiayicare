const { createReviewServiceBudget } = require('./reviewServiceBudget');
const { assertReviewConnection } = require('./reviewEnvironment');

// Adapters are server-owned dependencies, never supplied by an HTTP request.
// No real adapter is registered until isolated credentials and pricing are ready.
function createReviewExternalServices({ connection, env = process.env, adapters = {}, now = Date.now, authorize = async () => { throw new Error('审核授权检查未配置'); } }) {
  const reserve = createReviewServiceBudget({ connection, env, now });
  const enabled = service => ['ai', 'asr'].includes(service)
    && env.REVIEW_EXTERNAL_SERVICES_ENABLED === 'true'
    && env[`REVIEW_${service.toUpperCase()}_ENABLED`] === 'true'
    && typeof adapters[service]?.maximumCostFen === 'function'
    && typeof adapters[service]?.invoke === 'function';
  async function invoke(service, payload) {
    assertReviewConnection(connection, env);
    if (!enabled(service)) throw new Error('审核外部服务尚未启用');
    // Keep the priced request immutable across async reservation/provider steps.
    const input = structuredClone(payload);
    const adapter = adapters[service];
    // Estimation must be local, include the provider's worst-case charge, and
    // enforce input/output bounds. Neither this gateway nor adapters auto-retry.
    await authorize(service);
    const maximumCostFen = await adapter.maximumCostFen(input);
    await reserve({ service, maximumCostFen });
    // Recheck after reservation in case the kill switch changed while waiting.
    if (!enabled(service)) throw new Error('审核外部服务已关闭');
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(async () => { await authorize(service); return adapter.invoke(input, { signal: controller.signal }); }),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('审核服务超时，请稍后重试')); }, 20000);
        }),
      ]);
    } catch {
      throw new Error('审核服务暂不可用，请稍后重试');
    } finally { clearTimeout(timer); }
  }
  return {
    ai: { enabled: () => enabled('ai'), reply: input => invoke('ai', input) },
    asr: { asrEnabled: () => enabled('asr'), transcribeBase64: (data, mimeType) => invoke('asr', { data, mimeType }) },
  };
}
module.exports = { createReviewExternalServices };
