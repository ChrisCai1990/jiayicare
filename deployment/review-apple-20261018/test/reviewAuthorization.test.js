const test = require('node:test');
const assert = require('node:assert/strict');
const { createReviewExternalServices } = require('../src/utils/reviewExternalServices');
const { maximumCostFen, PRICE_VALID_UNTIL } = require('../src/utils/reviewRuntime');
function setup() {
  let consent = false, sends = 0, reservations = 0;
  const env = { REVIEW_ENVIRONMENT: 'isolated', MONGODB_URI: 'mongodb://review_app:test@127.0.0.1:27118/jiayicare_review?authSource=jiayicare_review',
    JWT_SECRET: 'synthetic'.repeat(8), STARTUP_BACKGROUND_JOBS_ENABLED: 'false', NATIVE_PUSH_ENABLED: 'false', UPLOADS_DIR: '/var/lib/jiayicare-review/uploads',
    REVIEW_EXTERNAL_SERVICES_ENABLED: 'true', REVIEW_AI_ENABLED: 'true', REVIEW_ASR_ENABLED: 'false', REVIEW_TOTAL_BUDGET_FEN: '1000',
    REVIEW_DAILY_CALL_LIMIT: '25', REVIEW_SERVICES_EXPIRES_AT: '2026-10-26T00:00:00+08:00' };
  const connection = { readyState: 1, name: 'jiayicare_review', host: '127.0.0.1', port: 27118, collection: () => ({
    updateOne: async (q, u) => { if (u.$inc) { reservations++; consent = false; } return { modifiedCount: 1 }; },
  }) };
  const services = createReviewExternalServices({ connection, env, now: () => Date.parse('2026-10-18'),
    authorize: async () => { if (!consent) throw new Error('no consent'); },
    adapters: { ai: { maximumCostFen: () => 10, invoke: async () => { sends++; return 'synthetic'; } } },
  });
  return { services, env, setConsent: value => { consent = value; }, facts: () => ({ sends, reservations }) };
}
test('review gateway refuses absent consent before reservation and revoked consent before send', async () => {
  const x = setup();
  await assert.rejects(x.services.ai.reply({ messages: [] }), /no consent/);
  assert.deepEqual(x.facts(), { sends: 0, reservations: 0 });
  x.setConsent(true);
  await assert.rejects(x.services.ai.reply({ messages: [] }));
  assert.deepEqual(x.facts(), { sends: 0, reservations: 1 });
});
test('the authorized CNY10 maximum cannot be raised by environment editing', async () => {
  const x = setup(); x.setConsent(true); x.env.REVIEW_TOTAL_BUDGET_FEN = '1001';
  await assert.rejects(x.services.ai.reply({ messages: [] }), /10元/);
  assert.deepEqual(x.facts(), { sends: 0, reservations: 0 });
});
test('price bound rejects oversized payload and expires rather than silently trusting old rates', () => {
  const payload = { messages: [{ role: 'user', content: 'synthetic' }] };
  assert.equal(maximumCostFen(payload, PRICE_VALID_UNTIL - 1), 10);
  assert.throws(() => maximumCostFen(payload, PRICE_VALID_UNTIL), /到期/);
  assert.throws(() => maximumCostFen({ messages: [{ role: 'user', content: 'x'.repeat(32768) }] }, PRICE_VALID_UNTIL - 1), /过长/);
});
