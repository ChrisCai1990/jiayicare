const test = require('node:test');
const assert = require('node:assert/strict');
const PackageEntitlement = require('../src/models/PackageEntitlement');
const { settleReservedPackageOrder } = require('../src/utils/packageServiceRedemption');

test('a medical package order redeems one shared entitlement when its service starts', async () => {
  const originalUpdateOne = PackageEntitlement.updateOne;
  const calls = [];
  PackageEntitlement.updateOne = async (...args) => { calls.push(args); return { modifiedCount: 1 }; };
  try {
    const order = { _id: 'order-1', serviceName: '医务代办服务', totalUnits: 3,
      status: 'scheduled', serviceStartedAt: new Date('2026-10-03T01:00:00Z'),
      packageEntitlementUsage: { entitlementId: 'entitlement-1' } };
    assert.equal((await settleReservedPackageOrder(order)).status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].usageRecords.$elemMatch.executionOrderId, 'order-1');
    assert.equal(calls[0][1].$set['usageRecords.$.status'], 'redeemed');
  } finally { PackageEntitlement.updateOne = originalUpdateOne; }
});

test('an unrelated multi-unit package service remains reserved until completed', async () => {
  const originalUpdateOne = PackageEntitlement.updateOne;
  PackageEntitlement.updateOne = async () => { throw new Error('should not redeem early'); };
  try {
    const order = { _id: 'order-2', serviceName: '其他服务', totalUnits: 3,
      status: 'scheduled', serviceStartedAt: new Date('2026-10-03T01:00:00Z'),
      packageEntitlementUsage: { entitlementId: 'entitlement-2' } };
    assert.equal((await settleReservedPackageOrder(order)).status, 'reserved');
  } finally { PackageEntitlement.updateOne = originalUpdateOne; }
});
