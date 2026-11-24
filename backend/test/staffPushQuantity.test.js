const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function routeHarness(withOrder = false) {
  const now = new Date();
  const records = Array.from({ length: 4 }, (_, index) => ({ _id: `push-${index + 1}`, staffId: 'staff',
    patientId: 'patient', type: 'product', createdAt: new Date(now.getTime() + index), withdrawnAt: null }));
  let handler, response, code = 200;
  const PushRecord = {
    findOne: async () => records[0],
    findOneAndUpdate: async query => records.find(row => row._id === query._id),
    updateOne: async (query, update) => {
      const row = records.find(item => item._id === query._id);
      if (Object.hasOwn(update.$set, 'withdrawnAt')) row.withdrawnAt = update.$set.withdrawnAt;
    },
  };
  const context = {
    router: { patch: (_path, _auth, _permission, callback) => { handler = callback; } },
    staffAuth: () => {}, checkPermission: () => () => {}, PushRecord,
    Order: { findOne: () => ({ select: async () => withOrder ? { _id: 'order' } : null }) },
    mongoose: { Types: { ObjectId: class { toString() { return 'lock'; } } } },
    require: name => { assert.equal(name, '../utils/combinableProductPushes'); return { samePushes: async () => records }; },
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
