const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativePushDispatch } = require('../src/utils/nativePushDispatch');
const message = { _id: 'abcdef0123456789abcdef01', user: 'patient', type: 'manager', unread: true };
function setup(overrides = {}) {
  const writes = [], sends = [], lookups = [];
  const job = { _id: 'job', messageId: message._id, attempts: 1 };
  const d = createNativePushDispatch({ enabled: () => true,
    Job: { updateOne: async (...args) => writes.push(args), findOneAndUpdate: async () => job },
    Message: { findById: () => ({ lean: async () => message }) },
    User: { findById: () => ({ lean: async () => ({ _id: 'patient' }) }) },
    registry: { destinations: async user => { lookups.push(user); return [{ provider: 'huawei', token: 'test-token' }]; } },
    transport: { send: async input => sends.push(input) }, ...overrides,
  });
  return { ...d, writes, sends, lookups };
}
test('default-off does not enqueue or send; drafts/AI/recalled/read messages excluded', async () => {
  const off = setup({ enabled: () => false });
  await off.enqueue(message); await off.tick();
  assert.deepEqual(off.writes, []); assert.deepEqual(off.sends, []);
  for (const patch of [{ unread: false }, { recalled: true }, { isAI: true }, { aiGenerated: true }, { type: 'system' }, { aiReviewStatus: 'pending' }]) {
    const c = setup({ Message: { findById: () => ({ lean: async () => ({ ...message, ...patch }) }) } });
    await c.enqueue({ ...message, ...patch });
    assert.equal(c.writes.length, 0);
    await c.tick(); assert.equal(c.sends.length, 0);
  }
});
test('saved human message enqueues idempotently and fresh registry decides recipients', async () => {
  const c = setup(); await c.enqueue(message); await c.tick();
  assert.deepEqual(c.writes[0][0], { _id: message._id });
  assert.ok(c.writes[0][1].$setOnInsert);
  assert.equal(c.lookups.length, 1);
  assert.deepEqual(c.sends, [{ provider: 'huawei', token: 'test-token', messageId: message._id, count: 0 }]);
  assert.equal(c.writes.at(-1)[1].$set.state, 'done');
  const revoked = setup({ registry: { destinations: async () => [] } });
  await revoked.tick(); assert.equal(revoked.sends.length, 0);
  assert.equal(revoked.writes.at(-1)[1].$set.state, 'no_destination');
});
test('transport failure schedules bounded retry without storing raw exception', async () => {
  const c = setup({ transport: { send: async () => { throw new Error('private-token'); } } });
  await c.tick();
  assert.equal(c.writes.at(-1)[1].$set.state, 'pending');
  assert.ok(!JSON.stringify(c.writes).includes('private-token'));
});

