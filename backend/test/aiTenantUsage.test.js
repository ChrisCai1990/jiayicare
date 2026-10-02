const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('institution AI usage separates tenants and keeps unattributed calls visible only to platform', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/aiControl.js'), 'utf8');
  const prefix = source.slice(0, source.indexOf('router.use(adminAuth,'));
  const handlers = new Map();
  const router = { get: (route, ...parts) => handlers.set(route, parts.at(-1)) };
  const own = '111111111111111111111111', other = '222222222222222222222222';
  const tenants = [
    { _id: own, name: '机构甲', code: 'a', status: 'active' },
    { _id: other, name: '机构乙', code: 'b', status: 'active' },
  ];
  const usage = [
    { _id: own, todayTokens: 10, monthTokens: 10, todayCalls: 1, monthCalls: 1 },
    { _id: other, todayTokens: 20, monthTokens: 20, todayCalls: 2, monthCalls: 2 },
    { _id: '', todayTokens: 30, monthTokens: 30, todayCalls: 3, monthCalls: 3 },
  ];
  let matched;
  const collection = name => name === 'tenants'
    ? { find: filter => ({ sort: () => ({ toArray: async () => filter._id ? tenants.filter(row => row._id === filter._id) : tenants }) }) }
    : { aggregate: pipeline => { matched = pipeline[0].$match; return { toArray: async () => matched.tenantId ? usage.filter(row => row._id === own) : usage }; } };
  vm.runInNewContext(prefix, {
    require: name => name === 'express' ? { Router: () => router }
      : name === 'crypto' ? { randomUUID: () => 'id' }
      : name === 'mongoose' ? { Types: { ObjectId: class {} } }
      : name === '../middleware/adminAuth' ? () => {}
      : name === '../utils/aiBudgetStore' ? { collection, ensure: () => {}, store: {} }
      : name === '../utils/aiBudgetPolicy' ? { DEFAULT_POLICY: {}, validatePolicy: () => {}, periodKeys: () => ({ day: '2026-10-02', month: '2026-10' }) }
      : require(name),
  });
  const handler = handlers.get('/tenant-usage');
  const invoke = async admin => {
    let status = 200, body;
    await handler({ admin }, { status(code) { status = code; return this; }, json(value) { body = value; } });
    return { status, body };
  };
  const platform = await invoke({ role: 'platformSuper' });
  assert.equal(platform.status, 200);
  assert.deepEqual(Array.from(platform.body.data.rows, row => [row.name, row.monthCalls]), [['机构甲', 1], ['机构乙', 2]]);
  assert.equal(platform.body.data.unattributed.monthCalls, 3);
  assert.equal(platform.body.data.rows[0].monthTokens, 10);
  const institution = await invoke({ role: 'superadmin', tenantId: own });
  assert.equal(institution.status, 200);
  assert.deepEqual(Array.from(institution.body.data.rows, row => row.name), ['机构甲']);
  assert.equal(institution.body.data.unattributed, undefined);
  assert.deepEqual(Array.from(matched.tenantId.$in, String), [own, own]);
  assert.equal((await invoke({ role: 'healthManager', tenantId: own })).status, 403);
});
