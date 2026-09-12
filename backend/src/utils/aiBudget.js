const { AsyncLocalStorage } = require('async_hooks');
const { randomUUID } = require('crypto');
const { store } = require('./aiBudgetStore');
const { AiControlError, isAiControlError, estimateTokens, actualUsage, costMicros, budgetScopes } = require('./aiBudgetPolicy');
const contextStorage = new AsyncLocalStorage();
function withAiContext(context, fn) { return contextStorage.run({ ...contextStorage.getStore(), ...context }, fn); }

function createBudgetRunner(db = store, now = () => new Date()) {
  return async function controlledCall({ provider, model, messages, maxTokens, context = {} }, send) {
    const ctx = { ...contextStorage.getStore(), ...context };
    ctx.business = ctx.business === 'ocr' ? 'ocr' : 'other';
    const started = now();
    const estimate = estimateTokens(messages, maxTokens);
    const reserved = [];
    const id = randomUUID();
    const key = `${provider}:${model}`;
    let policy, rate, estimatedMicros;
    try {
      if (ctx.stopState?.error) throw ctx.stopState.error;
      policy = await db.policy();
      if (policy.paused || (ctx.business === 'ocr' && policy.ocrPaused)) throw new AiControlError('AI 调用已由管理员暂停');
      if (ctx.deadline && started.getTime() >= ctx.deadline) throw new AiControlError('本次 OCR 已到运行时限，已暂停');
      if ((await db.circuit(key))?.paused) throw new AiControlError('模型连续异常，已自动暂停，请管理员检查后恢复', 'AI_CIRCUIT_PAUSED');
      rate = policy.prices?.[model];
      if ((policy.dailyYuan || policy.monthlyYuan) && !rate) throw new AiControlError(`模型 ${model} 未配置单价，金额预算启用后禁止调用`);
      estimatedMicros = costMicros(estimate, rate);
      for (const scope of budgetScopes(policy, ctx, started)) {
        if (!await db.reserve(scope, estimate.total, estimatedMicros || 0)) throw new AiControlError(`${scope.label}不足，已暂停。请管理员调整额度后继续`);
        reserved.push(scope.id);
      }
      await db.insert({ _id: id, createdAt: started, status: 'reserved', provider, model,
        business: ctx.business, reportId: ctx.reportId || '', page: ctx.page || null,
        stage: ctx.stage || 'request', actorId: ctx.actorId || '', tenantId: ctx.tenantId || '',
        reservedTokens: estimate.total, reservedMicros: estimatedMicros, rate: rate || null,
        scopes: reserved, inputTokens: null, outputTokens: null, actualTokens: null, costMicros: null });
    } catch (error) {
      // Only a known preflight refusal is rolled back. An ambiguous DB write failure stays
      // reserved conservatively; crucially, no provider request is made in either case.
      if (isAiControlError(error)) {
        if (ctx.stopState) ctx.stopState.error = error;
        for (const scope of reserved) await db.adjust(scope, -estimate.total, -(estimatedMicros || 0), -1);
        throw error;
      }
      const stopped = new AiControlError('AI 额度核验不可用，已阻止新调用', 'AI_ACCOUNTING_UNAVAILABLE');
      if (ctx.stopState) ctx.stopState.error = stopped;
      throw stopped;
    }
    let result, error;
    try { result = await send(); }
    catch (e) { error = e; }
    const usage = actualUsage(result?.usage);
    let malformed = false;
    if (ctx.business === 'ocr' && result?.choices?.[0]?.message?.content) {
      try { const parsed = JSON.parse(result.choices[0].message.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); malformed = !parsed || typeof parsed !== 'object'; }
      catch { malformed = true; }
    }
    const failed = Boolean(error || result?.error || malformed || !result?.choices?.[0]?.message?.content || result?.choices?.[0]?.finish_reason === 'length');
    try {
      await db.outcome(key, failed, policy.failureThreshold);
      // Missing usage (including timeout) retains its entire reservation. Never refund it
      // merely because our client disconnected; the supplier may have executed the request.
      if (usage) for (const scope of reserved) {
        await db.adjust(scope, usage.total - estimate.total, (costMicros(usage, rate) || 0) - (estimatedMicros || 0));
      }
      await db.finish(id, { status: usage ? (failed ? 'failed' : 'success') : 'unknown',
        finishedAt: now(), durationMs: now() - started,
        inputTokens: usage?.input ?? null, outputTokens: usage?.output ?? null, actualTokens: usage?.total ?? null,
        costMicros: usage ? costMicros(usage, rate) : null,
        // Do not persist arbitrary provider error messages, which may echo clinical inputs.
        errorCode: failed ? (error?.code === 'AI_TIMEOUT' ? 'TIMEOUT' : 'UPSTREAM_ERROR') : (usage ? '' : 'USAGE_MISSING'),
      });
    } catch {
      const stopped = new AiControlError('AI 用量结算异常，已暂停后续调用，请管理员核对', 'AI_ACCOUNTING_UNAVAILABLE');
      if (ctx.stopState) ctx.stopState.error = stopped;
      throw stopped;
    }
    if (error) throw error;
    if (result?.error) throw new Error('AI 服务返回异常，请稍后重试');
    if (failed) throw new Error('AI 返回空内容或输出被截断，请人工核对');
    return result;
  };
}
const controlledCall = createBudgetRunner();
module.exports = { controlledCall, createBudgetRunner, withAiContext };
