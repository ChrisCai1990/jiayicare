const test = require('node:test');
const assert = require('node:assert/strict');
const { createReviewAIAdapter } = require('../src/utils/reviewAIAdapter');
const input = () => ({ messages: [{ role: 'user', content: '合成测试：你好' }] });
const response = (content = '测试回复', finish_reason = 'stop') => new Response(JSON.stringify({ choices: [{ finish_reason, message: { content } }] }));
function fixture(fetchImpl = async () => response(), estimator = () => 2) {
  return createReviewAIAdapter({ apiKey: 'isolated-test-placeholder', estimateMaximumCostFen: estimator, fetchImpl });
}
test('requires explicit isolated credentials and local estimator; construction makes no request', () => {
  assert.throws(() => createReviewAIAdapter(), /未配置/);
  assert.throws(() => createReviewAIAdapter({ apiKey: 'test' }), /未配置/);
  let calls = 0;
  fixture(() => { calls++; throw new Error('must not run'); });
  assert.equal(calls, 0);
});
test('fixed endpoint/model and bounded text options cannot be overridden by payload', async () => {
  let actual; let estimated;
  const adapter = fixture(async (url, options) => { actual = { url, options }; return response(); }, body => { estimated = body; return 2; });
  const payload = { ...input(), model: 'other', endpoint: 'https://example.com', max_tokens: 100000, enable_search: true, tools: [{}] };
  assert.equal(await adapter.maximumCostFen(payload), 2);
  const signal = new AbortController().signal;
  assert.equal(await adapter.invoke(payload, { signal }), '测试回复');
  assert.equal(actual.url, 'https://ws-c30pv4x24nuz8jor.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions');
  assert.equal(actual.options.redirect, 'error');
  assert.equal(actual.options.signal, signal);
  const sent = JSON.parse(actual.options.body);
  assert.deepEqual(sent, estimated);
  assert.equal(sent.model, 'qwen-plus-2025-12-01');
  assert.equal(sent.max_tokens, 512); assert.equal(sent.enable_thinking, false);
  assert.equal(sent.enable_search, false); assert.equal(sent.tools, undefined);
});
test('invalid, multimodal, oversized and excessive history rejected before estimation or network', async () => {
  let estimates = 0; let calls = 0;
  const adapter = fixture(async () => { calls++; return response(); }, () => { estimates++; return 2; });
  for (const payload of [null, { messages: [] }, { messages: Array(17).fill({ role: 'user', content: 'x' }) },
    { messages: [{ role: 'tool', content: 'x' }] }, { messages: [{ role: 'user', content: [] }] },
    { messages: [{ role: 'user', content: '中'.repeat(12000) }] }]) {
    await assert.rejects(adapter.maximumCostFen(payload));
  }
  assert.equal(estimates, 0); assert.equal(calls, 0);
});
test('invalid pricing estimates cannot enter the budget gateway', async () => {
  for (const cost of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2']) {
    await assert.rejects(fixture(undefined, () => cost).maximumCostFen(input()), /上界无效/);
  }
});
test('missing or pre-aborted cancellation signal prevents calls', async () => {
  let calls = 0; const adapter = fixture(async () => { calls++; return response(); });
  await assert.rejects(adapter.invoke(input()));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(adapter.invoke(input(), { signal: controller.signal }));
  assert.equal(calls, 0);
});
test('provider errors, malformed output and truncated replies are not surfaced or retried', async () => {
  for (const makeResponse of [() => new Response('private-secret', { status: 429 }),
    () => new Response('private-secret'), () => response('partial', 'length'),
    () => response(''), () => response('x'.repeat(4001)), () => response('x'.repeat(70000))]) {
    let calls = 0;
    const adapter = fixture(async () => { calls++; return makeResponse(); });
    await assert.rejects(adapter.invoke(input(), { signal: new AbortController().signal }),
      e => e.message === '审核AI服务暂不可用');
    assert.equal(calls, 1);
  }
});
