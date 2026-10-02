const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../src/models/User');
const Entitlement = require('../src/models/PackageEntitlement');
const Redemption = require('../src/models/PackageEntitlementRedemption');
const { recordCompletedService, settleReservedPackageOrder, isFinalizedNutritionAssessment } = require('../src/utils/packageServiceRedemption');

const patientId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const sourceId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const productId = 'cccccccccccccccccccccccc';
const entitlementId = 'dddddddddddddddddddddddd';

test('服务完成仅按真实商品从共用池原子扣一次，并记录幂等来源', async t => {
  let debit = null, completed = false;
  t.mock.method(Redemption, 'findOneAndUpdate', async (_, update) => ({ token: update.$set.token }));
  t.mock.method(Redemption, 'updateOne', async (_, update) => { completed = update.$set.status === 'completed'; });
  t.mock.method(Entitlement, 'findOne', () => ({ lean: async () => null }));
  t.mock.method(User, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: patientId, familyLinks: [] }) }) }));
  t.mock.method(Entitlement, 'find', () => ({ sort: () => ({ lean: async () => [{
    _id: entitlementId, ownerUserId: patientId, rights: {
      sharedEntitlementPools: [{ key: 'medical', remainingCount: 4 }],
      productEntitlements: [{ productId, productName: '就医陪同服务', poolKey: 'medical' }],
    },
  }] }) }));
  t.mock.method(Entitlement, 'updateOne', async (filter, update) => {
    debit = { filter, update };
    return { modifiedCount: 1 };
  });
  const result = await recordCompletedService({ patientId, sourceType: 'order', sourceId, productId });
  assert.equal(result.status, 'completed');
  assert.equal(debit.update.$inc['rights.sharedEntitlementPools.0.remainingCount'], -1);
  assert.equal(debit.update.$push.usageRecords.sourceId, sourceId);
  assert.equal(debit.update.$push.usageRecords.status, 'redeemed');
  assert.ok(debit.filter['usageRecords.sourceKey'].$ne);
  assert.equal(completed, true);
});

test('同一完成事件已核销时直接返回，不再扣第二次', async t => {
  t.mock.method(Redemption, 'findOneAndUpdate', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  t.mock.method(Redemption, 'findById', () => ({ lean: async () => ({ status: 'completed' }) }));
  t.mock.method(Entitlement, 'updateOne', async () => { throw new Error('must not debit'); });
  const result = await recordCompletedService({ patientId, sourceType: 'order', sourceId, productId });
  assert.equal(result.status, 'completed');
});

test('取消未完成服务仅释放预占，已核销记录不能释放', async t => {
  let filter, update;
  t.mock.method(Entitlement, 'findById', () => ({ select: () => ({ lean: async () => ({
    rights: { sharedEntitlementPools: [{ key: 'medical' }] },
  }) }) }));
  t.mock.method(Entitlement, 'updateOne', async (f, u) => { filter = f; update = u; return { modifiedCount: 1 }; });
  const result = await settleReservedPackageOrder({ _id: sourceId, status: 'cancelled',
    packageEntitlementUsage: { entitlementId, poolKey: 'medical', productId } });
  assert.equal(result.status, 'cancelled');
  assert.equal(filter.usageRecords.$elemMatch.status, 'reserved');
  assert.equal(update.$inc['rights.sharedEntitlementPools.0.remainingCount'], 1);
});

test('服务完成将预占转为核销，不再次扣共享次数', async t => {
  let filter, update;
  t.mock.method(Entitlement, 'updateOne', async (f, u) => { filter = f; update = u; return { modifiedCount: 1 }; });
  const result = await settleReservedPackageOrder({ _id: sourceId, status: 'completed',
    completedAt: new Date('2026-10-02T08:00:00Z'), packageEntitlementUsage: { entitlementId, poolKey: 'medical' } });
  assert.equal(result.status, 'completed');
  assert.equal(filter.usageRecords.$elemMatch.status, 'reserved');
  assert.equal(update.$set['usageRecords.$.status'], 'redeemed');
  assert.equal(update.$inc, undefined);
});

test('记录实际服务启动时自动核销预占，随后取消也不退回已使用次数', async t => {
  let filter, update;
  t.mock.method(Entitlement, 'updateOne', async (f, u) => { filter = f; update = u; return { modifiedCount: 1 }; });
  const startedAt = new Date('2026-10-02T09:00:00Z');
  const result = await settleReservedPackageOrder({ _id: sourceId, status: 'scheduled', serviceStartedAt: startedAt,
    packageEntitlementUsage: { entitlementId, poolKey: 'medical' } });
  assert.equal(result.status, 'completed');
  assert.equal(filter.usageRecords.$elemMatch.status, 'reserved');
  assert.equal(update.$set['usageRecords.$.status'], 'redeemed');
  assert.equal(update.$set['usageRecords.$.usedAt'], startedAt);
  assert.equal(update.$inc, undefined);
});

test('多次服务仅启动时保持预占，整单完成后才核销套餐', async t => {
  let writes = 0;
  t.mock.method(Entitlement, 'updateOne', async () => { writes++; return { modifiedCount: 1 }; });
  const order = { _id: sourceId, status: 'scheduled', totalUnits: 3,
    serviceStartedAt: new Date(), packageEntitlementUsage: { entitlementId, poolKey: 'medical' } };
  assert.equal((await settleReservedPackageOrder(order)).status, 'reserved');
  assert.equal(writes, 0);
  assert.equal((await settleReservedPackageOrder({ ...order, status: 'completed' })).status, 'completed');
  assert.equal(writes, 1);
});

test('营养阶段评估必须正式归档后才成为核销来源', () => {
  assert.equal(isFinalizedNutritionAssessment({ status: 'archive_pending', serviceRecordId: sourceId, assessmentDomain: 'nutrition' }), false);
  assert.equal(isFinalizedNutritionAssessment({ status: 'finalized', assessmentDomain: 'nutrition' }), false);
  assert.equal(isFinalizedNutritionAssessment({ status: 'finalized', serviceRecordId: sourceId, assessmentDomain: 'nutrition' }), true);
  assert.equal(isFinalizedNutritionAssessment({ status: 'finalized', serviceRecordId: sourceId, assessmentDomain: 'comprehensive' }), false);
});
