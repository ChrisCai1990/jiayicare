const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createReviewDemo } = require('../src/utils/reviewDemo');
const env = { REVIEW_ENVIRONMENT: 'isolated', REVIEW_DEMO_ENABLED: 'true',
  MONGODB_URI: 'mongodb://review_app:test@127.0.0.1:27118/jiayicare_review?authSource=jiayicare_review',
  JWT_SECRET: 'test-only-'.repeat(8), STARTUP_BACKGROUND_JOBS_ENABLED: 'false', NATIVE_PUSH_ENABLED: 'false',
  UPLOADS_DIR: '/var/lib/jiayicare-review/uploads' };
const connection = { readyState: 1, host: '127.0.0.1', port: 27118, name: 'jiayicare_review' };
function setup(options = {}) {
  let counter = 0;
  const saved = {}, buckets = new Map(), deleted = [];
  const models = Object.fromEntries(['Tenant','User','Credential','Attempt','Session','Record','Report','Message','Admin'].map(name => {
    saved[name] = [];
    return [name, {
      async create(data) {
        if (name === options.fail) throw new Error('private DB connection details');
        const doc = { ...data, _id: name + (++counter), version: 1,
          async save() {}, toObject() { return { _id: this._id, name: this.name, tenantId: this.tenantId }; } };
        saved[name].push(doc); return doc;
      },
      async insertMany(rows) { for (const row of rows) await this.create(row); },
      async findOneAndUpdate(q) { const count = (buckets.get(q._id) || 0) + 1; buckets.set(q._id, count); return { count }; },
      async deleteMany(q) { deleted.push({ name, q }); }, async deleteOne(q) { deleted.push({ name, q }); },
    }];
  }));
  const handler = createReviewDemo({ models, connection: options.connection || connection, env: { ...env, ...options.env } });
  return { saved, deleted, buckets, async call(body = { consent: 'synthetic-demo-v1' }) {
    const result = { status: 200, headers: {} };
    await handler({ body, ip: '127.0.0.1' }, { set(k,v) { result.headers[k] = v; },
      status(n) { result.status = n; return this; }, json(body) { result.body = body; } });
    return result;
  } };
}
test('demo is closed in production, disabled mode and wrong database without writes', async () => {
  for (const options of [{ env: { REVIEW_ENVIRONMENT: '' } }, { env: { REVIEW_DEMO_ENABLED: 'false' } },
    { connection: { ...connection, name: 'jiayicare' } }]) {
    const s = setup(options); assert.ok((await s.call()).status >= 400);
    assert.equal(s.saved.User.length, 0); assert.equal(s.saved.Session.length, 0);
  }
});
test('explicit synthetic-data acknowledgement required; arbitrary user ids ignored', async () => {
  const s = setup(); assert.equal((await s.call({ user: 'production-id' })).status, 400);
  assert.equal(s.saved.User.length, 0);
});
test('each visitor gets independent tenant, records and revocable bounded claims, no password', async () => {
  const s = setup(); const a = await s.call(), b = await s.call();
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.notEqual(a.body.data.user._id, b.body.data.user._id);
  assert.notEqual(a.body.data.user.tenantId, b.body.data.user.tenantId);
  assert.notEqual(s.saved.Tenant[0].websiteHosts[0], s.saved.Tenant[1].websiteHosts[0]);
  assert.ok(s.saved.Tenant[0].websiteHosts[0].endsWith('.invalid'));
  assert.equal(s.saved.Record.length, 8); assert.equal(s.saved.Admin.length, 6);
  const claims = jwt.verify(a.body.data.token, env.JWT_SECRET, { issuer: 'jiayicare-review', audience: 'jiayicare-review' });
  assert.equal(claims.id, a.body.data.user._id); assert.equal(claims.exp - claims.iat, 86400);
  assert.equal(claims.reviewAccount, s.saved.Credential[0]._id);
  assert.equal(s.saved.Session[0].method, 'review_demo');
  assert.equal(a.headers['Cache-Control'], 'no-store');
  assert.ok(!JSON.stringify(a.body).includes('password'));
  assert.equal(s.saved.User[0].phone, undefined);
});
test('failed initialization cleans only newly allocated ids and hides internal errors', async () => {
  const s = setup({ fail: 'Report' }); const r = await s.call();
  assert.equal(r.status, 503); assert.equal(s.saved.Session.length, 0);
  assert.ok(s.deleted.length >= 7);
  assert.ok(!JSON.stringify(r).includes('private DB'));
  for (const { q } of s.deleted) assert.equal(Object.keys(q).length, 1);
});
test('persistent per-IP quota rejects before creating identities', async () => {
  const s = setup(); const bucket = Math.floor(Date.now() / 3600000);
  s.buckets.set(`demo-global:${bucket}`, 100);
  const r = await s.call(); assert.equal(r.status, 429); assert.equal(s.saved.User.length, 0);
  assert.ok(Number(r.headers['Retry-After']) > 0);
});
