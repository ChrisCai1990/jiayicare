const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareReportItemRelink } = require('../src/utils/reportItemRelink');
const old = '111111111111111111111111', next = '222222222222222222222222';
const report = { _id: 'r', user: 'u', planId: 'p', planItemId: old };
const plan = { status: 'active', items: [{ _id: old, status: 'skipped' }, { _id: next, status: 'pending' }] };
function model(value) { return { findOne: filter => {
  assert.deepEqual(filter, { _id: 'p', patientId: 'u' }); return { lean: async () => value };
} }; }
test('same-patient same-plan target creates fresh durable intent without mutation', async () => {
  const before = JSON.stringify(plan);
  const result = await prepareReportItemRelink(model(plan), report, next);
  assert.equal(result.intent.itemId, next); assert.equal(result.intent.status, 'pending');
  assert.equal(JSON.stringify(plan), before);
});
test('invalid, cancelled, completed, bound or non-pending targets are rejected', async () => {
  for (const id of [old, 'bad', null]) assert.ok((await prepareReportItemRelink(model(plan), report, id)).error);
  for (const value of [null, { ...plan, status: 'cancelled' }, { ...plan, status: 'completed' },
    { ...plan, items: [{ _id: old, reportId: 'r' }, plan.items[1]] },
    { ...plan, items: [plan.items[0], { _id: next, status: 'completed' }] },
    { ...plan, items: [plan.items[0], { _id: next, status: 'pending', reportId: 'other' }] }]) {
    assert.ok((await prepareReportItemRelink(model(value), report, next)).error);
  }
});
