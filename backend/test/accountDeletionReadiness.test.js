const test = require('node:test');
const assert = require('node:assert/strict');
const {workerReady, REVISION} = require('../src/utils/accountDeletionReadiness');
test('intake requires a fresh successful worker check for the current policy', async () => {
  const now = Date.parse('2026-10-29T00:00:00Z');
  const env = {ACCOUNT_DELETION_GUARD_ENABLED:'true', ACCOUNT_DELETION_POLICY_VERSION:'current'};
  let row;
  const db = {collection: name => {
    assert.equal(name, 'accountdeletionworkerstatus');
    return {findOne: async query => { assert.equal(query._id, REVISION); return row; }};
  }};
  for (const candidate of [null, {ready:false}, {ready:true,policyVersion:'old',checkedAt:new Date(now)},
    {ready:true,policyVersion:'current',checkedAt:new Date(now-900000)},
    {ready:true,policyVersion:'current',checkedAt:'bad'},
    {ready:true,policyVersion:'current',checkedAt:new Date(now+1)}]) {
    row = candidate; assert.equal(await workerReady(db, env, now), false);
  }
  row = {ready:true,policyVersion:'current',checkedAt:new Date(now-1000)};
  assert.equal(await workerReady(db, env, now), true);
  assert.equal(await workerReady(db, {...env, ACCOUNT_DELETION_GUARD_ENABLED:'false'}, now), false);
  assert.equal(await workerReady(null, env, now), false);
});
