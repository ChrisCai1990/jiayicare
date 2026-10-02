const test = require('node:test');
const assert = require('node:assert/strict');
const { reconcileHistoricalCounts } = require('../src/utils/packageEntitlementHistory');

const entitlement = () => ({ sourceType: 'effective_service', historyVerified: false,
  rights: { sharedEntitlementPools: [{ key: 'medical', name: '就医陪同', count: 4, remainingCount: 3 }],
    productEntitlements: [
      { productId: 'escort', productName: '就医陪同', poolKey: 'medical', count: 4 },
      { productId: 'nutrition', productName: '营养评估服务', count: 12, remainingCount: 11 },
    ] },
  usageRecords: [
    { productId: 'escort', poolKey: 'medical', status: 'redeemed' },
    { productId: 'nutrition', poolKey: '', status: 'reserved' },
    { productId: 'nutrition', poolKey: '', status: 'cancelled' },
  ],
});

test('历史核对按共用池和独立权益合并新台账记录，不更改输入', () => {
  const source = entitlement();
  const rights = reconcileHistoricalCounts(source, { poolUsed: [2], productUsed: [0, 5] });
  assert.equal(rights.sharedEntitlementPools[0].remainingCount, 1);
  assert.equal(rights.productEntitlements[1].remainingCount, 6);
  assert.equal(source.rights.sharedEntitlementPools[0].remainingCount, 3);
});

test('历史核对拒绝共享池重复填写、超额和重复确认', () => {
  assert.throws(() => reconcileHistoricalCounts(entitlement(), { poolUsed: [2], productUsed: [1, 5] }), /共享池/);
  assert.throws(() => reconcileHistoricalCounts(entitlement(), { poolUsed: [4], productUsed: [0, 5] }), /超过总次数/);
  assert.throws(() => reconcileHistoricalCounts({ ...entitlement(), historyVerified: true }, { poolUsed: [2], productUsed: [0, 5] }), /已经完成/);
});
