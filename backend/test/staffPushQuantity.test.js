const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function routeHarness(withOrder = false, refundOutcome = '') {
  const now = new Date();
  const records = Array.from({ length: 4 }, (_, index) => ({ _id: `push-${index + 1}`, staffId: 'staff',
    patientId: 'patient', type: 'product', createdAt: new Date(now.getTime() + index), withdrawnAt: null }));
  let handler, response, code = 200;
  const PushRecord = {
    findOne: async () => records[0],
    find: async query => records.filter(row => row.recommendationBatchId === query.recommendationBatchId && row.patientId === query.patientId && row.staffId === query.staffId),
    updateMany: async (query, update) => records.filter(row => query._id.$in.includes(row._id)).forEach(row => Object.assign(row, update.$set)),
    findOneAndUpdate: async query => records.find(row => row._id === query._id),
    updateOne: async (query, update) => {
      const row = records.find(item => item._id === query._id);
      if (Object.hasOwn(update.$set, 'withdrawnAt')) row.withdrawnAt = update.$set.withdrawnAt;
    },
  };
  const context = {
    router: { patch: (_path, _auth, _permission, callback) => { handler = callback; } },
    staffAuth: () => {}, checkPermission: () => () => {}, PushRecord,
    Order: { find: () => ({ select: async () => refundOutcome ? [{ _id: 'order', refundStatus: 'processing' }] : [] }), findOne: () => ({ select: async () => withOrder ? { _id: 'order' } : null }) },
    mongoose: { isValidObjectId: () => true, Types: { ObjectId: class { toString() { return 'lock'; } } } },
    require: name => { if (name === '../utils/reconcileRefund') return { reconcileRefund: async () => { withOrder = refundOutcome !== 'full'; } }; assert.equal(name, '../utils/combinableProductPushes'); return { orderPushFilter: () => ({}), samePushes: async () => records }; },
    Number, String, Date, Set,
  };
  const source = fs.readFileSync(require.resolve('../src/routes/staff'), 'utf8');
  const start = source.indexOf("router.patch('/products/push-quantity/:id'");
  const end = source.indexOf("router.post('/products/push-bundle'", start);
  assert.ok(start > 0 && end > start);
  vm.runInNewContext(source.slice(start, end), context);
  const res = { status(value) { code = value; return this; }, json(value) { response = value; return this; } };
  return { records, run: async quantity => { await handler({ body: { quantity }, params: { id: 'push-1' }, staff: { _id: 'staff' } }, res); return { code, response }; } };
}

test('staff reduces four recommendations to two without deleting their history', async () => {
  const h = routeHarness();
  const result = await h.run(2);
  assert.equal(result.code, 200);
  assert.equal(result.response.data.quantity, 2);
  assert.equal(h.records.filter(row => !row.withdrawnAt).length, 2);
  assert.equal(h.records.length, 4);
});

test('staff cannot change quantity after an order is open', async () => {
  const h = routeHarness(true);
  const result = await h.run(2);
  assert.equal(result.code, 409);
  assert.equal(h.records.filter(row => !row.withdrawnAt).length, 4);
});

test('recall targets only the selected historical recommendation', async () => {
  const h = routeHarness();
  assert.equal((await h.run(0)).code, 200);
  assert.equal(h.records[0].withdrawnBy, 'staff');
  assert.equal(h.records.filter(row => row.recalledAt).length, 1);
});

test('recall targets the original patient and batch, and survives later quantity changes', async () => {
  const h = routeHarness();
  h.records[0].recommendationBatchId = h.records[1].recommendationBatchId = 'batch';
  assert.equal((await h.run(0)).code, 200);
  assert.equal(h.records.filter(row => row.withdrawnAt).length, 2);
  await h.run(2);
  assert.ok(h.records[0].withdrawnAt && h.records[1].withdrawnAt);
});

test('recall preserves a push with an active order', async () => {
  const h = routeHarness(true);
  assert.equal((await h.run(0)).code, 409);
  assert.equal(h.records.filter(row => row.withdrawnAt).length, 0);
});

test('recall rechecks the linked order after reconciling its refund', async () => {
  for (const outcome of ['full', 'partial', 'processing']) {
    const h = routeHarness(true, outcome);
    assert.equal((await h.run(0)).code, outcome === 'full' ? 200 : 409);
    assert.equal(Boolean(h.records[0].recalledAt), outcome === 'full');
  }
});
