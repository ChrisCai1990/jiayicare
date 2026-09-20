const test = require('node:test');
const assert = require('node:assert/strict');
const { arm, createQueue } = require('../src/utils/reportPlanItemQueue');
test('only explicit audited links create durable intent; new audit replaces token', () => {
  const row = { audit_status: 'unaudited', planId: 'p', planItemId: 'i' };
  arm(row); assert.equal(row.planItemSync, undefined);
  row.audit_status = 'audited'; arm(row);
  const token = row.planItemSync.token;
  assert.equal(row.planItemSync.status, 'pending');
  arm(row); assert.notEqual(row.planItemSync.token, token);
});
test('revoked audit or changed association stops queued write', async () => {
  for (const patch of [{ audit_status: 'rejected' }, { planItemId: 'new-item' }]) {
    let status;
    const MedicalReport = { findOne: () => ({ lean: async () => ({ _id: 'r', user: 'u', audit_status: 'audited', planId: 'p', planItemId: 'i',
      planItemSync: { token: 't', planId: 'p', itemId: 'i' }, ...patch }) }),
      updateOne: async (filter, update) => { assert.equal(filter['planItemSync.token'], 't'); status = update.$set['planItemSync.status']; } };
    await createQueue({ MedicalReport, HealthPlan: { updateOne: () => assert.fail('obsolete intent must not write') } }).reconcile('r', 't');
    assert.equal(status, 'obsolete');
  }
});
test('unmarked legacy report cannot be reconciled accidentally', async () => {
  await createQueue({ MedicalReport: { findOne: () => assert.fail('missing token') } }).reconcile('legacy');
});
test('explicit keep-existing decision survives audit replay, but not a new association', () => {
  const row = { audit_status: 'audited', planId: 'p', planItemId: 'i', planItemSync: {
    token: 'reviewed-conflict', status: 'resolved', planId: 'p', itemId: 'i', resolution: { action: 'keep_existing' },
  } };
  arm(row); assert.equal(row.planItemSync.token, 'reviewed-conflict');
  row.planItemId = 'new'; arm(row);
  assert.equal(row.planItemSync.status, 'pending');
  assert.notEqual(row.planItemSync.token, 'reviewed-conflict');
});
