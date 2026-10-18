const test = require('node:test');
const assert = require('node:assert/strict');
const sift = require('sift').default;
const { createReviewExternalServices } = require('../src/utils/reviewExternalServices');
function setup({ fail = false, configured = true, enabled = true, adapterOverride } = {}) {
  let row, providerCalls = 0;
  const env = {
    REVIEW_ENVIRONMENT: 'isolated', MONGODB_URI: 'mongodb://review_app:test@127.0.0.1:27118/jiayicare_review?authSource=jiayicare_review',
    JWT_SECRET: 'test-only-'.repeat(8), STARTUP_BACKGROUND_JOBS_ENABLED: 'false', NATIVE_PUSH_ENABLED: 'false',
    UPLOADS_DIR: '/var/lib/jiayicare-review/uploads', REVIEW_EXTERNAL_SERVICES_ENABLED: String(enabled),
    REVIEW_AI_ENABLED: 'true', REVIEW_ASR_ENABLED: 'true', REVIEW_TOTAL_BUDGET_FEN: '20',
    REVIEW_DAILY_CALL_LIMIT: '5', REVIEW_SERVICES_EXPIRES_AT: '2026-11-01T00:00:00+08:00',
  };
  const connection = { readyState: 1, host: '127.0.0.1', port: 27118, name: 'jiayicare_review', collection: () => ({
    async updateOne(q, u) {
      if (u.$setOnInsert) { row ||= { _id: q._id, ...structuredClone(u.$setOnInsert) }; return {}; }
      if (!sift(q)(row)) return { modifiedCount: 0 };
      for (const [key, amount] of Object.entries(u.$inc)) {
        if (key.startsWith('daily.')) { const day = key.slice(6); row.daily[day] = (row.daily[day] || 0) + amount; }
        else row[key] += amount;
      }
      return { modifiedCount: 1 };
    },
  }) };
  const adapter = { maximumCostFen: () => 10, invoke: async (payload, { signal }) => {
    providerCalls++; assert.equal(row.reservedFen, providerCalls * 10); assert.equal(signal.aborted, false);
    if (fail) throw new Error('private provider secret');
    return payload.data ? '合成测试转写' : '合成测试回复';
  } };
  return { services: createReviewExternalServices({ connection, env, authorize: async () => {}, now: () => Date.parse('2026-10-05T00:00:00Z'), adapters: configured ? { ai: adapterOverride || adapter, asr: adapter } : {} }), calls: () => providerCalls, row: () => row };
}
test('disabled gateway and missing adapters never invoke provider or reserve', async () => {
  for (const options of [{ configured: false }, { enabled: false }]) {
    const x = setup(options);
    assert.equal(x.services.asr.asrEnabled(), false);
    await assert.rejects(x.services.ai.reply('test'));
    await assert.rejects(x.services.asr.transcribeBase64('test', 'audio/wav'));
    assert.equal(x.calls(), 0); assert.equal(x.row(), undefined);
  }
});
test('AI and ASR reserve from the same budget before simulated calls', async () => {
  const x = setup();
  assert.equal(await x.services.ai.reply('test'), '合成测试回复');
  assert.equal(await x.services.asr.transcribeBase64('test', 'audio/wav'), '合成测试转写');
  await assert.rejects(x.services.ai.reply('over budget'), /额度/);
  assert.equal(x.calls(), 2);
});
test('provider errors are redacted, never retried, and reservation stays charged', async () => {
  const x = setup({ fail: true });
  await assert.rejects(x.services.ai.reply('test'), e => !e.message.includes('secret') && /暂不可用/.test(e.message));
  assert.equal(x.calls(), 1); assert.equal(x.row().reservedFen, 10);
});

test('caller mutation during estimation cannot change the reserved request', async () => {
  let release, priced;
  const waiting = new Promise(resolve => { release = resolve; });
  const x = setup({ adapterOverride: {
    maximumCostFen: async input => { priced = structuredClone(input); await waiting; return 10; },
    invoke: async input => { assert.deepEqual(input, priced); return input.messages[0].content; },
  } });
  const payload = { messages: [{ role: 'user', content: 'original' }] };
  const pending = x.services.ai.reply(payload);
  payload.messages[0].content = 'changed after pricing';
  release();
  assert.equal(await pending, 'original');
  assert.equal(x.row().reservedFen, 10);
});
