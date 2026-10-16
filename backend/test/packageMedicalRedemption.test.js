const test = require('node:test');
const assert = require('node:assert/strict');
const PackageEntitlement = require('../src/models/PackageEntitlement');
const User = require('../src/models/User');
const { settleReservedPackageOrder } = require('../src/utils/packageServiceRedemption');
const { reserveStaffMedicalBenefit } = require('../src/utils/medicalProxyWorkflow');

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

test('annual expert appointment records family feature use without debiting a shared pool', async () => {
  const patientId = '507f1f77bcf86cd799439011';
  const ownerId = '507f1f77bcf86cd799439012';
  const productId = '507f1f77bcf86cd799439013';
  const entitlementId = '507f1f77bcf86cd799439014';
  const originals = { findById: User.findById, find: PackageEntitlement.find, updateOne: PackageEntitlement.updateOne };
  User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId, familyLinks: [{ linkedUser: ownerId }] }) }) });
  PackageEntitlement.find = () => ({ sort: () => ({ lean: async () => [{
    _id: entitlementId, ownerUserId: ownerId, familySharing: true, historyVerified: true,
    rights: { aiEntitlements: { expertAppointment: true }, sharedEntitlementPools: [{ key: 'medical', remainingCount: 4 }],
      productEntitlements: [{ productId, productName: '专家约诊服务', poolKey: 'medical' }] },
  }] }) });
  PackageEntitlement.updateOne = async () => { throw new Error('unlimited feature must not debit quota'); };
  const order = { _id: '507f1f77bcf86cd799439015', save: async () => {} };
  try {
    assert.equal((await reserveStaffMedicalBenefit(patientId, order, '专家约诊服务')).status, 'included_unlimited');
    assert.equal(String(order.membershipFeatureUsage.usedByUserId), patientId);
    assert.equal(String(order.membershipFeatureUsage.ownerUserId), ownerId);
    assert.equal(order.membershipFeatureUsage.featureKey, 'expertAppointment');
    assert.equal(order.packageEntitlementUsage, undefined);
    assert.equal(order.paymentStatus, 'paid');
  } finally {
    User.findById = originals.findById;
    PackageEntitlement.find = originals.find;
    PackageEntitlement.updateOne = originals.updateOne;
  }
});

test('expert appointment without annual entitlement cannot create an unaccounted free service', async () => {
  const originals = { findById: User.findById, find: PackageEntitlement.find };
  User.findById = () => ({ select: () => ({ lean: async () => ({
    _id: '507f1f77bcf86cd799439011', familyLinks: [], servicePackage: '',
  }) }) });
  PackageEntitlement.find = () => ({ sort: () => ({ lean: async () => [] }) });
  try {
    const order = { save: async () => { throw new Error('must not mark free order paid'); } };
    assert.equal((await reserveStaffMedicalBenefit('507f1f77bcf86cd799439011', order, '专家约诊服务')).status,
      'expert_not_included');
  } finally {
    User.findById = originals.findById;
    PackageEntitlement.find = originals.find;
  }
});
