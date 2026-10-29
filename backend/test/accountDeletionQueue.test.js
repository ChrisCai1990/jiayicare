const test = require('node:test');
const assert = require('node:assert/strict');
const { listDeletionQueue } = require('../src/utils/accountDeletionQueue');
const actor = { _id: 'responsible', tenantId: 'institution-a', role: 'superadmin', staffStatus: 'active' };
const env = { ACCOUNT_DELETION_FINANCE_ADMIN_IDS: 'responsible' };

test('queue scopes every query to the authenticated institution and never returns receipt capabilities', async () => {
  const filters = [];
  const requests = {
    countDocuments: async filter => { filters.push(filter); return 1; },
    find(filter, options) {
      filters.push(filter);
      assert.equal(options.projection.receiptNonce, undefined);
      const cursor = { sort: () => cursor, skip: n => { assert.equal(n, 25); return cursor; },
        limit: n => { assert.equal(n, 25); return cursor; }, toArray: async () => [{
          _id: 'request-a', status: 'requested', requestedAt: '2026-10-01T00:00:00Z', completionDays: 7,
          receiptNonce: 'secret', user: 'private-user', operatorFailure: 'internal-error', completionEvidence: 'private-proof',
        }] };
      return cursor;
    },
  };
  const data = await listDeletionQueue({ actor, env, requests,
    query: { tenantId: 'institution-b', page: '2' }, now: Date.parse('2026-10-09T00:00:00Z') });
  assert.ok(filters.every(filter => filter.tenantId === 'institution-a'));
  assert.deepEqual(data.items[0], { id: 'request-a', status: 'requested', requestedAt: '2026-10-01T00:00:00Z',
    dueAt: new Date('2026-10-08T00:00:00Z'), completedAt: null, overdue: true });
  assert.equal(data.pending, 1);
});

test('ordinary, unlisted, inactive and platform administrators cannot read queue', async () => {
  for (const denied of [{ ...actor, role: 'manager' }, { ...actor, _id: 'other' },
    { ...actor, staffStatus: 'inactive' }, { ...actor, role: 'platformSuper' }, { ...actor, tenantId: null }]) {
    await assert.rejects(listDeletionQueue({ actor: denied, env, requests: {} }), error => error.status === 403);
  }
});

test('invalid filters are rejected before database access', async () => {
  for (const query of [{ status: { $ne: 'completed' } }, { page: '-1' }, { page: '1.5' }, { page: '10001' }]) {
    await assert.rejects(listDeletionQueue({ actor, env, requests: {}, query }), error => error.status === 400);
  }
});

test('completed records are never overdue and invalid deadlines are not invented', async () => {
  const cursor = { sort: () => cursor, skip: () => cursor, limit: () => cursor, toArray: async () => [
    { _id: 'done', status: 'completed', requestedAt: '2020-01-01', completionDays: 7 },
    { _id: 'unknown', status: 'needs_review', requestedAt: 'bad-date', completionDays: 7 },
  ] };
  const requests = { find: () => cursor, countDocuments: async () => 2 };
  const { items } = await listDeletionQueue({ actor, env, requests, query: { status: 'all' } });
  assert.equal(items[0].overdue, false);
  assert.equal(items[1].dueAt, null);
  assert.equal(items[1].overdue, false);
});
