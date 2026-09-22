const DEFAULT_POLICY = Object.freeze({
  paused: false, ocrPaused: false, dailyTokens: 2000000, monthlyTokens: 30000000,
  ocrDailyTokens: 1500000, otherDailyTokens: 500000,
  reportTokens: 1500000, pageTokens: 160000, reportCalls: 400, pageCalls: 8,
  dailyCalls: 2000, failureThreshold: 5, warningPercent: 80,
  dailyYuan: 0, monthlyYuan: 0, prices: {},
});

class AiControlError extends Error {
  constructor(message, code = 'AI_BUDGET_PAUSED') { super(message); this.code = code; this.aiControl = true; }
}
const isAiControlError = error => error?.aiControl === true;
// A page refusal stops only that page's provider calls; the outer report may keep its results.
function rethrowAiControl(error) { if (isAiControlError(error) && error.code !== 'AI_PAGE_BUDGET_PAUSED') throw error; }
function periodKeys(now = new Date()) {
  const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return { day, month: day.slice(0, 7) };
}
function validatePolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('配置格式无效');
  const out = {};
  for (const [key, fallback] of Object.entries(DEFAULT_POLICY)) {
    const value = input[key];
    if (key === 'prices') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 30) throw new Error('模型单价格式无效');
      out.prices = {};
      for (const [model, rate] of Object.entries(value)) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(model) || !rate || !['input', 'output'].every(k => typeof rate[k] === 'number' && Number.isFinite(rate[k]) && rate[k] >= 0 && rate[k] <= 10000)) throw new Error('模型单价须为每百万 Token 的非负人民币金额');
        out.prices[model] = { input: rate.input, output: rate.output };
      }
    } else if (typeof fallback === 'boolean') {
      if (typeof value !== 'boolean') throw new Error('暂停开关格式无效');
      out[key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < (key.endsWith('Yuan') ? 0 : 1) || value > 1000000000 || (!key.endsWith('Yuan') && !Number.isInteger(value))) throw new Error(`${key} 必须为有效正数，只有金额上限允许为 0`);
      out[key] = value;
    }
  }
  if (out.warningPercent > 99 || out.failureThreshold > 100) throw new Error('预警比例须小于 100，连续失败阈值不能超过 100');
  return out;
}
// Deliberately conservative estimate; image tokenization is provider-dependent. This is a
// reservation, not a claim of exact billing or a tokenizer implementation.
function estimateTokens(messages = [], maxTokens = 2000) {
  let input = 256;
  for (const message of messages) {
    if (typeof message.content === 'string') input += Buffer.byteLength(message.content, 'utf8');
    else for (const part of message.content || []) {
      if (part.type === 'image_url') input += 16384;
      else if (part.text) input += Buffer.byteLength(part.text, 'utf8');
    }
  }
  const output = Math.max(1, Number(maxTokens) || 2000);
  return { input, output, total: input + output };
}
function actualUsage(usage) {
  if (!usage || !['prompt_tokens', 'completion_tokens'].every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0)) return null;
  return { input: usage.prompt_tokens, output: usage.completion_tokens, total: Math.max(usage.prompt_tokens + usage.completion_tokens, Number(usage.total_tokens) || 0) };
}
function costMicros(tokens, rate) {
  return rate ? Math.ceil(tokens.input * rate.input + tokens.output * rate.output) : null;
}
function budgetScopes(policy, context, now) {
  const { day, month } = periodKeys(now);
  const scopes = [
    { id: `day:${day}`, label: '今日总预算', tokens: policy.dailyTokens, calls: policy.dailyCalls, micros: Math.round(policy.dailyYuan * 1000000) || null },
    { id: `month:${month}`, label: '本月总预算', tokens: policy.monthlyTokens, micros: Math.round(policy.monthlyYuan * 1000000) || null },
    { id: `business:${context.business}:${day}`, label: context.business === 'ocr' ? 'OCR 今日预算' : '其他 AI 今日预算', tokens: context.business === 'ocr' ? policy.ocrDailyTokens : policy.otherDailyTokens },
  ];
  if (context.reportId) {
    scopes.push({ id: `report:${context.reportId}`, label: '报告累计预算', tokens: policy.reportTokens, calls: policy.reportCalls });
    if (context.page) scopes.push({ id: `page:${context.reportId}:${context.page}`, label: `第 ${context.page} 页累计预算`, tokens: policy.pageTokens, calls: policy.pageCalls });
  }
  return scopes;
}
function budgetRefusalReason(scope, counter = {}, tokens = 0, micros = 0, calls = 1) {
  const usedCalls = Number(counter.calls || 0), callLimit = Number(scope.calls || 0) + Number(counter.extraCalls || 0);
  if (scope.calls && usedCalls + calls > callLimit) return `${scope.label}调用次数不足（已用 ${usedCalls}/${callLimit} 次，本次需要 ${calls} 次），请管理员追加该范围的调用次数后继续`;
  const usedTokens = Number(counter.tokens || 0), tokenLimit = Number(scope.tokens || 0) + Number(counter.extraTokens || 0);
  if (usedTokens + tokens > tokenLimit) return `${scope.label}Token 不足（已用 ${usedTokens}/${tokenLimit}，本次预留 ${tokens}），请管理员调整额度后继续`;
  if (scope.micros && Number(counter.micros || 0) + micros > scope.micros) return `${scope.label}金额不足，请管理员调整金额额度后继续`;
  return '';
}
module.exports = { DEFAULT_POLICY, AiControlError, isAiControlError, rethrowAiControl, periodKeys, validatePolicy, estimateTokens, actualUsage, costMicros, budgetScopes, budgetRefusalReason };
