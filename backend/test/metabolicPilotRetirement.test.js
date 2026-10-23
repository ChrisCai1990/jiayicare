const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../src/routes/metabolicPilot');
const SystemConfig = require('../src/models/SystemConfig');
const { configFor } = require('../src/utils/metabolicPilot');

function handler(path, method) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} route exists`);
  return layer.route.stack[0].handle;
}

async function call(path, method, req = {}) {
  let result;
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { result = { status: this.statusCode || 200, body }; return this; },
  };
  await handler(path, method)(req, res, error => { throw error; });
  return result;
}

test('retirement hides the card from installed clients and prevents restart', async () => {
  const me = await call('/me', 'get', { user: { _id: 'existing-user' } });
  assert.deepEqual(me.body.data, { available: false, retired: true });
  assert.equal('status' in me.body.data, false);
  for (const action of ['start', 'help', 'withdraw']) {
    assert.equal((await call('/me', 'post', { body: { action } })).status, 410);
  }
  assert.equal((await call('/admin/config', 'put', { body: { enabled: true, accepting: true } })).status, 410);
  assert.equal((await call('/admin/invite', 'post', { body: {} })).status, 410);
  assert.equal((await call('/admin/:id', 'patch', { body: { action: 'restore' } })).status, 410);
});

test('stale enabled setting cannot resume feedback', async () => {
  const original = SystemConfig.findOne;
  SystemConfig.findOne = () => ({ maxTimeMS: () => ({ lean: async () => ({ value: { enabled: true, accepting: true, revision: 3 } }) }) });
  try {
    assert.deepEqual(await configFor({ tenantId: 'tenant' }), { enabled: false, accepting: false, revision: 3 });
  } finally {
    SystemConfig.findOne = original;
  }
});
