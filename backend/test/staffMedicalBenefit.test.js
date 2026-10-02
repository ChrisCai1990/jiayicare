const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const PackageEntitlement = require('../src/models/PackageEntitlement');
const { reserveStaffMedicalBenefit } = require('../src/utils/medicalProxyWorkflow');

test('health advisor medical service reserves one shared package unit and never double debits a depleted pool', async () => {
  const previousFindUser = User.findById;
  const previousFindEntitlements = PackageEntitlement.find;
  const previousUpdate = PackageEntitlement.updateOne;
  const patientId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const pool = { key: 'medical_shared', count: 1, remainingCount: 1 };
  const entitlement = {
    _id: new mongoose.Types.ObjectId(), ownerUserId: patientId,
    sourceOrderId: new mongoose.Types.ObjectId(), packageName: '健康年轻态计划',
    historyVerified: true, rights: { sharedEntitlementPools: [pool], productEntitlements: [
      { productId, productName: '医疗代诊服务', poolKey: 'medical_shared' },
      { productId: new mongoose.Types.ObjectId(), productName: '就医陪同服务', poolKey: 'medical_shared' },
    ] },
  };
  const usage = [];
  try {
    User.findById = () => ({ select: () => ({ lean: async () => ({ _id: patientId, familyLinks: [] }) }) });
    PackageEntitlement.find = () => ({ sort: () => ({ lean: async () => [entitlement] }) });
    PackageEntitlement.updateOne = async (filter, update) => {
      if (pool.remainingCount < 1) return { modifiedCount: 0 };
      assert.equal(filter['rights.sharedEntitlementPools.0.remainingCount'].$gte, 1);
      pool.remainingCount -= 1;
      usage.push(update.$push.usageRecords);
      return { modifiedCount: 1 };
    };
    const order = { _id: new mongoose.Types.ObjectId(), save: async () => {} };
    assert.equal((await reserveStaffMedicalBenefit(patientId, order, '医疗代诊服务')).status, 'reserved');
    assert.equal(order.paymentStatus, 'paid');
    assert.equal(order.status, 'scheduled');
    assert.equal(String(order.packageEntitlementUsage.productId), String(productId));
    assert.equal(usage.length, 1);
    assert.equal(pool.remainingCount, 0);
    const second = { _id: new mongoose.Types.ObjectId(), save: async () => { throw new Error('should not save'); } };
    assert.equal((await reserveStaffMedicalBenefit(patientId, second, '陪同看诊服务')).status, 'exhausted');
    assert.equal(usage.length, 1);
  } finally {
    User.findById = previousFindUser;
    PackageEntitlement.find = previousFindEntitlements;
    PackageEntitlement.updateOne = previousUpdate;
  }
});
