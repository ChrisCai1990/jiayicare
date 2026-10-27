const test = require('node:test');
const assert = require('node:assert/strict');
const { issueReceipt, readReceipt } = require('../src/utils/accountDeletionReceipt');
const secret = 'synthetic-independent-receipt-secret';
const record = { _id: '012345678901234567890123', tenantId: 'tenant-a', user: 'user-a', receiptNonce: 'random-nonce',
  receiptExpiresAt: new Date(100000), status: 'requested', requestedAt: new Date(100), completionDays: 7,
  notice: 'internal policy', sensitiveHealthData: 'must not leak' };
function setup(row = record) { return { secret, now: 5000, requests: { objectId: id => id, findOne: async q => q._id === row?._id ? row : null } }; }
test('receipt works without an active account and returns only limited status', async () => {
  const { token } = issueReceipt(record, secret);
  const result = await readReceipt({ ...setup(), token });
  assert.equal(result.status, 'requested');
  for (const field of ['user', 'tenantId', 'notice', 'receiptNonce', 'sensitiveHealthData']) assert.equal(result[field], undefined);
});
test('changed account, institution, nonce or expiry invalidates an old capability', async () => {
  const { token } = issueReceipt(record, secret);
  for (const patch of [{ user: 'other' }, { tenantId: 'other' }, { receiptNonce: 'other' }, { receiptExpiresAt: new Date(90000) }]) {
    await assert.rejects(readReceipt({ ...setup({ ...record, ...patch }), token }), e => e.status === 404);
  }
});
test('bad, unknown and expired capabilities all fail without exposing a record', async () => {
  const { token } = issueReceipt(record, secret);
  for (const value of [null, 'bad', token + 'x', 'ffffffffffffffffffffffff.' + token.split('.')[1]]) {
    await assert.rejects(readReceipt({ ...setup(), token: value }), e => e.status === 404);
  }
  await assert.rejects(readReceipt({ ...setup(), token, now: 100000 }), e => e.status === 404);
});
test('receipt cannot claim completion from a status change without evidence', async () => {
  const row = { ...record, status: 'completed', completedAt: new Date(1000) };
  assert.equal((await readReceipt({ ...setup(row), token: issueReceipt(row, secret).token })).status, 'processing');
});
test('missing independent signing key fails closed', () => {
  assert.throws(() => issueReceipt(record, 'short'), e => e.status === 503);
});
