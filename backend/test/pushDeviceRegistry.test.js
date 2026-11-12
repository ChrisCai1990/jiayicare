const test = require('node:test');
const assert = require('node:assert/strict');
const { createPushDeviceRegistry } = require('../src/utils/pushDeviceRegistry');

function setup() {
  const rows = new Map();
  const sessions = [{ user: 'a', sessionId: 'a1', logoutAt: null }, { user: 'b', sessionId: 'b1', logoutAt: null }];
  const matches = (row, query) => Object.entries(query).every(([key, value]) => value?.$in ? value.$in.includes(row[key]) : row[key] === value);
  const query = data => ({ select() { return this; }, async lean() { return data; } });
  let enabled = true;
  const api = createPushDeviceRegistry({
    enabled: () => enabled,
    Device: {
      findById(id) { return query(rows.get(id) || null); },
      async updateOne(filter, update) { rows.set(filter._id, { ...rows.get(filter._id), _id: filter._id, ...update.$set }); },
      async deleteOne(filter) { for (const [id, row] of rows) if (matches(row, filter)) rows.delete(id); },
      find(filter) { return query([...rows.values()].filter(row => matches(row, filter))); },
    },
    Session: {
      async exists(filter) { return sessions.some(row => matches(row, filter)); },
      find(filter) { return query(sessions.filter(row => matches(row, filter))); },
    },
  });
  return { api, rows, sessions, disable() { enabled = false; } };
}
const a = { _id: 'a', tenantId: 'tenant-a' };
const b = { _id: 'b', tenantId: 'tenant-b' };
const input = { provider: 'huawei', token: 'test-device-token' };

test('registration binds server identity, account switch transfers destination and isolates old unregister', async () => {
  const x = setup();
  await x.api.register(a, 'a1', { ...input, user: 'b', tenantId: 'tenant-b', sessionId: 'b1' });
  assert.equal([...x.rows.values()][0].user, 'a');
  [...x.rows.values()][0].settings = { doctor: false };
  await x.api.register(a, 'a1', input);
  assert.equal(x.rows.size, 1);
  assert.equal([...x.rows.values()][0].settings.doctor, false);
  await x.api.register(b, 'b1', input);
  assert.deepEqual([...x.rows.values()][0].settings, {});
  await x.api.unregister(a, 'a1', input);
  assert.equal(x.rows.size, 1);
  assert.deepEqual(await x.api.destinations(a), []);
  assert.deepEqual(await x.api.destinations(b), [input]);
  assert.deepEqual(await x.api.destinations({ ...b, tenantId: 'wrong-tenant' }), []);
  await x.api.unregister(b, 'old-session', input);
  assert.equal(x.rows.size, 1);
  await x.api.unregister(b, 'b1', input);
  assert.equal(x.rows.size, 0);
});

test('logout, deleted accounts and disabled feature cannot yield notification destinations', async () => {
  const x = setup();
  await x.api.register(a, 'a1', input);
  x.sessions[0].logoutAt = new Date();
  assert.deepEqual(await x.api.destinations(a), []);
  await assert.rejects(x.api.register(a, 'a1', input), { status: 401 });
  assert.deepEqual(await x.api.destinations({ ...a, isDeleted: true }), []);
  x.disable();
  await assert.rejects(x.api.register(b, 'b1', input), { status: 503 });
  assert.deepEqual(await x.api.destinations(b), []);
  await x.api.unregister(a, 'a1', input);
  assert.equal(x.rows.size, 0, 'disable does not prevent cleanup');
});

test('rejects missing sessions, another users session and malformed device credentials', async () => {
  const x = setup();
  for (const session of ['', 'b1']) await assert.rejects(x.api.register(a, session, input), { status: 401 });
  for (const value of [{ ...input, provider: 'unknown' }, { ...input, token: '' }, { ...input, token: {} }, { ...input, token: 'x\ny' }, { ...input, token: 'x'.repeat(4097) }]) {
    await assert.rejects(x.api.register(a, 'a1', value), { status: 400 });
  }
  assert.equal(x.rows.size, 0);
});
