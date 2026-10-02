const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Entitlement = require('../src/models/PackageEntitlement');
const Order = require('../src/models/Order');
const { packageFirstOrder } = require('../src/utils/packageFirstOrder');

const userId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const productId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const entitlementId = 'cccccccccccccccccccccccc';
const user = { _id: userId, familyLinks: [] };
const product = { _id: productId, name: '就医陪同服务', serviceItems: [] };
const input = { user, product, service: { specificationLabel: '' }, totalUnits: 1,
  serviceItems: [], note: '', fulfillmentType: 'offline_service' };

function rows(remainingCount = 4, historyVerified = true) {
  return [{ _id: entitlementId, ownerUserId: userId, sourceOrderId: 'dddddddddddddddddddddddd',
    historyVerified, rights: { sharedEntitlementPools: [{ key: 'medical', remainingCount }],
      productEntitlements: [{ productId, productName: product.name, poolKey: 'medical' }] } }];
}

function stubEntitlements(t, list) {
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => user }) }));
  t.mock.method(Entitlement, 'find', () => ({ sort: () => ({ lean: async () => list }) }));
}

test('套餐有余额时创建零元履约单并原子预占共享次数', async t => {
  stubEntitlements(t, rows());
  let created, filter, update;
  t.mock.method(Order, 'create', async value => { created = value; return { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', ...value }; });
  t.mock.method(Entitlement, 'updateOne', async (f, u) => { filter = f; update = u; return { modifiedCount: 1 }; });
  const result = await packageFirstOrder(input);
  assert.equal(result.status, 'reserved');
  assert.equal(created.servicePrice, 0);
  assert.equal(created.paymentStatus, 'paid');
  assert.equal(filter['rights.sharedEntitlementPools.0.remainingCount'].$gte, 1);
  assert.equal(update.$inc['rights.sharedEntitlementPools.0.remainingCount'], -1);
  assert.equal(update.$push.usageRecords.status, 'reserved');
});

test('历史余额未核对时禁止新付费下单；套餐用尽后允许付费', async t => {
  stubEntitlements(t, rows(4, false));
  t.mock.method(Order, 'create', async () => { throw new Error('不得创建订单'); });
  assert.equal((await packageFirstOrder(input)).status, 'history_pending');
  t.mock.restoreAll();
  stubEntitlements(t, rows(0, true));
  assert.equal((await packageFirstOrder(input)).status, 'exhausted');
});
