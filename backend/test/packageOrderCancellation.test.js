const test = require('node:test');
const assert = require('node:assert/strict');
const Order = require('../src/models/Order');
const Fulfillment = require('../src/models/Fulfillment');
const FollowUp = require('../src/models/FollowUp');
const PackageEntitlement = require('../src/models/PackageEntitlement');
const redemption = require('../src/utils/packageServiceRedemption');
const { packageCancellationBlock, cancelPackageCoveredOrder } = require('../src/utils/packageOrderCancellation');

function coveredOrder(overrides = {}) {
  return { _id: 'order-1', user: 'user-1', status: 'pending', tradeStatus: 'paid',
    paymentStatus: 'paid', paidAmount: 0, usedUnits: 0, serviceStartedAt: null,
    packageEntitlementUsage: { entitlementId: 'entitlement-1' }, ...overrides };
}

test('only unused, unarranged package rights orders can be cancelled', () => {
  assert.equal(packageCancellationBlock(coveredOrder(), { status: 'awaiting_booking' }), '');
  assert.match(packageCancellationBlock(coveredOrder({ paidAmount: 1 })), /实际付款/);
  assert.match(packageCancellationBlock(coveredOrder({ usedUnits: 1 })), /服务已安排或开始/);
  assert.match(packageCancellationBlock(coveredOrder({ serviceStartedAt: new Date() })), /服务已安排或开始/);
  assert.match(packageCancellationBlock(coveredOrder(), { status: 'booked' }), /服务已安排或开始/);
  assert.match(packageCancellationBlock(coveredOrder({ status: 'cancelled' })), /状态已变化/);
});

test('cancelled package order restores reserved right and closes fulfillment and work items', async t => {
  const order = coveredOrder();
  const calls = [];
  t.mock.method(Order, 'findById', async () => order);
  t.mock.method(Order, 'findOneAndUpdate', async (filter, update) => {
    if (update.$set?.checkoutActionLockToken) return order;
    calls.push(['order', update.$set]);
    return { ...order, ...update.$set };
  });
  t.mock.method(Order, 'updateOne', async () => ({ modifiedCount: 1 }));
  t.mock.method(Fulfillment, 'findOne', async () => ({ status: 'awaiting_booking' }));
  t.mock.method(Fulfillment, 'updateOne', async (filter, update) => { calls.push(['fulfillment', update.$set]); return { modifiedCount: 1 }; });
  t.mock.method(FollowUp, 'updateMany', async (filter, update) => { calls.push(['followup', update.$set]); return { modifiedCount: 1 }; });
  t.mock.method(PackageEntitlement, 'findOne', () => ({ select: async () => ({ _id: 'entitlement-1' }) }));
  t.mock.method(redemption, 'settleReservedPackageOrder', async cancelled => {
    assert.equal(cancelled.status, 'cancelled');
    calls.push(['right', 'restored']);
    return { status: 'cancelled' };
  });
  const result = await cancelPackageCoveredOrder(order);
  assert.match(result.message, /套餐权益已恢复/);
  assert.deepEqual(calls.map(row => row[0]), ['order', 'right', 'fulfillment', 'followup']);
  assert.equal(calls[0][1].tradeStatus, 'closed');
  assert.equal(calls[1][1], 'restored');
  assert.equal(calls[2][1].status, 'cancelled');
});
