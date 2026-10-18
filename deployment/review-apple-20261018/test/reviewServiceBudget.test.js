const test = require('node:test');
const assert = require('node:assert/strict');
const { createReviewServiceBudget } = require('../src/utils/reviewServiceBudget');

function setup(patch = {}) {
  const env = {
    REVIEW_ENVIRONMENT: 'isolated',
    MONGODB_URI: 'mongodb://review_app:test@127.0.0.1:27118/jiayicare_review?authSource=jiayicare_review',
    JWT_SECRET: 'test-only-'.repeat(8), STARTUP_BACKGROUND_JOBS_ENABLED: 'false', NATIVE_PUSH_ENABLED: 'false',
    UPLOADS_DIR: '/var/lib/jiayicare-review/uploads', REVIEW_EXTERNAL_SERVICES_ENABLED: 'true',
    REVIEW_AI_ENABLED: 'true', REVIEW_ASR_ENABLED: 'true', REVIEW_TOTAL_BUDGET_FEN: '100',
    REVIEW_DAILY_CALL_LIMIT: '2', REVIEW_SERVICES_EXPIRES_AT: '2026-11-01T00:00:00+08:00', ...patch,
  };
  let state, calls = 0, time = Date.parse('2026-10-05T15:59:00Z');
  const ledger = { async updateOne(q, u) {
    calls++;
    if (u.$setOnInsert) { state ||= structuredClone(u.$setOnInsert); return { modifiedCount: 0 }; }
    const key = Object.keys(u.$inc).find(k => k.startsWith('daily.')).slice(6);
    assert.equal(q.$or[1][`daily.${key}`].$lt, state.dailyLimit);
    if (state.capFen !== q.capFen || state.dailyLimit !== q.dailyLimit
      || state.reservedFen > q.reservedFen.$lte || (state.daily[key] || 0) >= state.dailyLimit) return { modifiedCount: 0 };
    state.reservedFen += u.$inc.reservedFen;
    state.daily[key] = (state.daily[key] || 0) + 1;
    return { modifiedCount: 1 };
  } };
  const connection = { readyState: 1, host: '127.0.0.1', port: 27118, name: 'jiayicare_review', collection() { return ledger; } };
  const create = () => createReviewServiceBudget({ connection, env, now: () => time });
  return { env, connection, ledger, create, reserve: create(), state: () => state, calls: () => calls, nextDay: () => { time += 120000; } };
}

test('disabled, expired, production and malformed budgets never touch ledger', async () => {
  for (const patch of [{ REVIEW_EXTERNAL_SERVICES_ENABLED: undefined }, { REVIEW_AI_ENABLED: 'false' },
    { REVIEW_ENVIRONMENT: 'production' }, { REVIEW_TOTAL_BUDGET_FEN: '0' }, { REVIEW_TOTAL_BUDGET_FEN: '1.5' },
    { REVIEW_TOTAL_BUDGET_FEN: '9007199254740992' }, { REVIEW_DAILY_CALL_LIMIT: '-1' },
    { REVIEW_SERVICES_EXPIRES_AT: 'invalid' }, { REVIEW_SERVICES_EXPIRES_AT: '2026-10-01' }]) {
    const x = setup(patch);
    await assert.rejects(x.reserve({ service: 'ai', maximumCostFen: 1 }));
    assert.equal(x.calls(), 0);
  }
  const x = setup();
  for (const cost of [0, -1, 1.2, NaN, Infinity, 101]) await assert.rejects(x.reserve({ service: 'ai', maximumCostFen: cost }));
  await assert.rejects(x.reserve({ service: 'sms', maximumCostFen: 1 }));
  assert.equal(x.calls(), 0);
});

test('AI and ASR share total reservations across midnight and guard recreation', async () => {
  const x = setup();
  await x.reserve({ service: 'ai', maximumCostFen: 30 });
  await x.reserve({ service: 'asr', maximumCostFen: 20 });
  await assert.rejects(x.reserve({ service: 'ai', maximumCostFen: 1 }), /额度/);
  x.nextDay();
  const afterRestart = x.create();
  assert.equal((await afterRestart({ service: 'ai', maximumCostFen: 50 })).day, '2026-10-06');
  await assert.rejects(afterRestart({ service: 'asr', maximumCostFen: 1 }), /额度/);
  assert.equal(x.state().reservedFen, 100);
});

test('configuration edits and ledger outages fail closed', async () => {
  const x = setup();
  await x.reserve({ service: 'ai', maximumCostFen: 10 });
  x.env.REVIEW_TOTAL_BUDGET_FEN = '200';
  await assert.rejects(x.reserve({ service: 'ai', maximumCostFen: 10 }), /配置/);
  x.ledger.updateOne = async () => { throw new Error('database unavailable'); };
  await assert.rejects(x.reserve({ service: 'asr', maximumCostFen: 10 }), /database unavailable/);
  assert.equal(x.state().reservedFen, 10);
});

test('concurrent reservations are refused when shared daily limit is reached (ledger double)', async () => {
  const x = setup();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => x.reserve({ service: 'ai', maximumCostFen: 10 })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
  assert.equal(x.state().reservedFen, 20);
});
