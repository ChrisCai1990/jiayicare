const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('same product and specification combine only records without an active order', async () => {
  const records = [
    { _id: 'a', patientId: 'patient', tenantId: null, type: 'product', createdAt: new Date(), products: [{ productId: 'd', name: '维生素D', price: 359.67, specificationLabel: '2000IU*90粒' }] },
    { _id: 'b', patientId: 'patient', tenantId: null, type: 'product', createdAt: new Date(), products: [{ productId: 'd', name: '维生素D', price: 359.67, specificationLabel: '2000IU*90粒' }] },
    { _id: 'c', patientId: 'patient', tenantId: null, type: 'product', createdAt: new Date(), products: [{ productId: 'd', name: '维生素D', price: 359.67, specificationLabel: '5000IU*120粒' }] },
    { _id: 'd', patientId: 'patient', tenantId: null, type: 'product', createdAt: new Date(), products: [{ productId: 'd', name: '维生素D', price: 360, specificationLabel: '2000IU*90粒' }] },
  ];
  let query;
  const mocks = {
    '../models/Order': { find: q => { query = q; return { select: () => ({ lean: async () => [{ pushRecordId: 'b' }] }) }; } },
    '../models/PushRecord': { find: () => ({ sort: () => ({ limit: () => ({ lean: async () => records }) }) }) },
    './checkoutAmounts': { cents: value => Math.round(Number(value) * 100) },
  };
  const context = { module: { exports: {} }, require: name => mocks[name], Date, String, Number, Set, Math };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/utils/combinableProductPushes'), 'utf8'), context);
  const result = await context.module.exports.availableSamePushes(records[0], 'patient');
  assert.deepEqual(result.map(row => row._id), ['a']);
  assert.deepEqual(query.pushRecordId.$in, ['a', 'b']);
  assert.equal(query.status.$ne, 'cancelled');
});
