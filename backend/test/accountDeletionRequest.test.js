const test = require('node:test');
const assert = require('node:assert/strict');
const { createService, readPolicy, publicRequest } = require('../src/utils/accountDeletionRequest');
const actor = { _id: 'customer-a', tenantId: 'tenant-a' };
const env = { ACCOUNT_DELETION_ENABLED: 'true', ACCOUNT_DELETION_POLICY_VERSION: 'test-v1',
  ACCOUNT_DELETION_NOTICE: 'Test only: deletion scope under review.', ACCOUNT_DELETION_COMPLETION_DAYS: '7', JWT_SECRET: 'test-only-secret', ACCOUNT_DELETION_RECEIPT_SECRET: 'synthetic-receipt-secret-32-bytes-only' };
function setup(overrides = {}) {
  const rows = new Map(); let time = 1000000; let writes = 0;
  const key = q => `${q.tenantId}:${q.user}`;
  const requests = {
    async findOne(q) { return rows.get(key(q)) || null; },
    async findOneAndUpdate(q, update) {
      writes++;
      if (!rows.has(key(q))) rows.set(key(q), { _id: String(rows.size + 1), ...update.$setOnInsert });
      return rows.get(key(q));
    },
  };
  const service = createService({ isExecutionReady: async () => true, requests, env: { ...env, ...overrides }, now: () => time });
  return { service, requests, rows, advance(ms) { time += ms; }, writes: () => writes };
}
async function inputFor(service, who = actor) {
  const data = await service.get(who);
  return { confirmation: 'DELETE_MY_ACCOUNT', confirmationToken: data.confirmationToken };
}
test('default disabled, incomplete policy fails closed, and no writes occur', async () => {
  assert.equal(readPolicy({}), null);
  for (const overrides of [{ ACCOUNT_DELETION_ENABLED: 'false' }, { ACCOUNT_DELETION_NOTICE: '' },
    { ACCOUNT_DELETION_COMPLETION_DAYS: '0' }, { ACCOUNT_DELETION_COMPLETION_DAYS: '7.5' }, { ACCOUNT_DELETION_POLICY_VERSION: '' }]) {
    const app = setup(overrides);
    assert.equal((await app.service.get(actor)).available, false);
    await assert.rejects(app.service.submit(actor, {}), e => e.status === 503);
    assert.equal(app.writes(), 0);
  }
});
test('missing or deleted actor cannot read or create requests', async () => {
  const app = setup();
  for (const who of [null, { _id: 'a' }, { ...actor, isDeleted: true }]) {
    await assert.rejects(app.service.get(who), e => e.status === 401);
    await assert.rejects(app.service.submit(who, {}), e => e.status === 401);
  }
});
test('requires explicit confirmation and leaves data unchanged when it is absent', async () => {
  const app = setup(); const input = await inputFor(app.service);
  await assert.rejects(app.service.submit(actor, { ...input, confirmation: '' }), e => e.status === 400);
  assert.equal(app.writes(), 0);
});
test('confirmation cannot be reused by another customer or institution', async () => {
  const app = setup(); const input = await inputFor(app.service);
  for (const who of [{ ...actor, _id: 'customer-b' }, { ...actor, tenantId: 'tenant-b' }]) {
    await assert.rejects(app.service.submit(who, input), e => e.status === 400);
  }
  assert.equal(app.writes(), 0);
});
test('tampered and expired confirmation fails without writes', async () => {
  const app = setup(); const input = await inputFor(app.service);
  await assert.rejects(app.service.submit(actor, { ...input, confirmationToken: input.confirmationToken + 'x' }), e => e.status === 400);
  app.advance(600001);
  await assert.rejects(app.service.submit(actor, input), e => e.status === 400);
  assert.equal(app.writes(), 0);
});
test('updated notice invalidates earlier confirmation even with same version', async () => {
  const app = setup(); const input = await inputFor(app.service);
  const changed = createService({ isExecutionReady: async () => true, requests: app.requests, env: { ...env, ACCOUNT_DELETION_NOTICE: 'Changed scope' }, now: () => 1000000 });
  await assert.rejects(changed.submit(actor, input), e => e.status === 400);
  assert.equal(app.writes(), 0);
});
test('repeat and concurrent submissions return one pending record, never claim completion', async () => {
  const app = setup(); const input = await inputFor(app.service);
  const results = await Promise.all([app.service.submit(actor, input), app.service.submit(actor, input)]);
  assert.equal(app.rows.size, 1);
  assert.equal(results[0].id, results[1].id);
  assert.equal(results[0].status, 'requested');
  assert.equal(results[0].completedAt, null);
  assert.equal((await app.service.get(actor)).confirmationToken, null);
});
test('customer cannot inject another account, status, notice or completion evidence', async () => {
  const app = setup(); const input = await inputFor(app.service);
  const result = await app.service.submit(actor, { ...input, user: 'victim', tenantId: 'other', status: 'completed', notice: 'forged', completionEvidence: 'forged' });
  assert.equal(result.status, 'requested');
  assert.equal(result.notice, env.ACCOUNT_DELETION_NOTICE);
  assert.ok(app.rows.has('tenant-a:customer-a'));
  assert.equal((await app.service.get({ _id: 'victim', tenantId: 'other' })).request, null);
});
test('duplicate database insert races recover the existing request', async () => {
  const record = { _id: 'r1', status: 'requested' };
  const service = createService({ isExecutionReady: async () => true, requests: {
    async findOne() { return record; },
    async findOneAndUpdate() { throw Object.assign(new Error('duplicate'), { code: 11000 }); },
  }, env, now: () => 1000000 });
  const input = await inputFor(setup().service);
  assert.equal((await service.submit(actor, input)).id, 'r1');
});
test('database failure does not acknowledge receipt', async () => {
  const app = setup(); const input = await inputFor(app.service);
  app.requests.findOneAndUpdate = async () => { throw new Error('database unavailable'); };
  await assert.rejects(app.service.submit(actor, input), /database unavailable/);
});
test('completion status without recorded cleanup evidence is not exposed as completed', () => {
  assert.equal(publicRequest({ _id: 'a', status: 'completed', completedAt: new Date() }).status, 'processing');
  assert.equal(publicRequest({ _id: 'a', status: 'requested' }).completedAt, null);
});

test('configured route stays closed until a real cleanup executor supplies readiness', async () => {
  const app = setup();
  const closed = createService({ requests: app.requests, env });
  assert.equal((await closed.get(actor)).available, false);
  await assert.rejects(closed.submit(actor, {}), e => e.status === 503);
  assert.equal(app.writes(), 0);
});
