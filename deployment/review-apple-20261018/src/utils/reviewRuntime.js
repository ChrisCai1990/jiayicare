const { createReviewExternalServices } = require('./reviewExternalServices');
const { createReviewAIAdapter, requestBody } = require('./reviewAIAdapter');
// Verified Beijing Qwen-Plus-2025-12-01 pricing on 2026-10-18:
// <=128k input: CNY0.8/M input, CNY2/M non-thinking output tokens.
// A <=32768-byte body plus a conservative 4096-token framing allowance and
// <=512 output tokens costs < CNY0.04. Reserve CNY0.10, including failures.
// No tools, search, thinking, retries, other models or image inputs are allowed.
const PRICE_VALID_UNTIL = Date.parse('2026-10-26T00:00:00+08:00');
function maximumCostFen(body, now = Date.now()) {
  requestBody(body);
  if (!Number.isFinite(now) || now >= PRICE_VALID_UNTIL) throw new Error('审核价格核验已到期');
  return 10;
}
function services() {
  const env = process.env;
  const adapters = {};
  if (env.REVIEW_ENVIRONMENT === 'isolated' && env.REVIEW_QWEN_API_KEY) {
    adapters.ai = createReviewAIAdapter({ apiKey: env.REVIEW_QWEN_API_KEY, estimateMaximumCostFen: maximumCostFen });
  }
  return createReviewExternalServices({ connection: require('mongoose').connection, env, adapters,
    authorize: () => require('./aiDataConsent').assertContextPermission('qwen'),
  });
}
module.exports = { services, maximumCostFen, PRICE_VALID_UNTIL };
