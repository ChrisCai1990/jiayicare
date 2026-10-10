const mongoose = require('mongoose');
const Order = require('../models/Order');
const PackageEntitlement = require('../models/PackageEntitlement');
const { applicableEntitlements } = require('./packageEntitlements');
const { ensureEffectiveServiceLedger } = require('./packageServiceRedemption');

function coveredRight(entitlement, productId, specificationLabel) {
  const matches = (entitlement.rights?.productEntitlements || []).map((right, index) => ({ right, index }))
    .filter(({ right }) => String(right.productId) === String(productId)
      && (!right.specificationLabel || right.specificationLabel === (specificationLabel || '')));
  if (matches.length !== 1) return null;
  const { right, index } = matches[0];
  const poolIndex = right.poolKey
    ? (entitlement.rights.sharedEntitlementPools || []).findIndex(pool => pool.key === right.poolKey) : -1;
  if (right.poolKey && poolIndex < 0) return null;
  const available = poolIndex >= 0
    ? Number(entitlement.rights.sharedEntitlementPools[poolIndex].remainingCount || 0)
    : Number(right.remainingCount || 0);
  return { entitlement, right, index, poolIndex, available };
}

async function packageFirstOrder({ user, payerUser, product, service, totalUnits, serviceItems, note, desiredServiceDate,
  serviceRequirements, fulfillmentType, supervisorId }) {
  if (!product || product.memberBundle?.enabled) return { status: 'not_covered' };
  let rows = await applicableEntitlements(user._id);
  if (!rows.some(row => coveredRight(row, product._id, service.specificationLabel))) {
    await ensureEffectiveServiceLedger(user);
    rows = await applicableEntitlements(user._id);
  }
  const matches = rows.map(row => coveredRight(row, product._id, service.specificationLabel)).filter(Boolean);
  if (!matches.length) return { status: 'not_covered' };
  if (matches.some(match => match.entitlement.historyVerified === false)) {
    return { status: 'history_pending' };
  }
  const match = matches.find(item => item.available >= 1);
  if (!match) return { status: 'exhausted' };
  const { entitlement, right, index, poolIndex } = match;
  const now = new Date();
  const order = await Order.create({
    user: user._id, payerUser: payerUser || user._id, beneficiaryName: user.name || '', tenantId: user.tenantId || null,
    serviceId: String(product._id), serviceName: product.name,
    specificationLabel: service.specificationLabel || right.specificationLabel || '',
    servicePrice: 0, unitPrice: 0, totalUnits, usedUnits: 0,
    orderNo: `ENT${Date.now()}${new mongoose.Types.ObjectId().toString().slice(-6)}`.slice(0, 32),
    orderType: 'service', fulfillmentType, status: 'pending', tradeStatus: 'paid',
    paymentStatus: 'paid', paidAmount: 0, paymentExpectedAmount: 0, paidAt: now,
    initiationSource: 'customer', supervisorId: supervisorId || null,
    desiredServiceDate, serviceRequirements, note,
    serviceItemsSnapshot: serviceItems.map(item => ({ key: item.key, name: item.name,
      units: item.units, usedUnits: 0, performers: item.performers || [] })),
    performanceRuleSnapshot: product.performanceRule || null,
    servicePerformerRolesSnapshot: product.servicePerformerRoles || [],
    serviceWorkflowSnapshot: product.serviceWorkflow || null,
    serviceProviderSnapshot: { code: product.serviceProvider || 'platform', companyName: '杭州嘉医汇健康管理有限公司' },
    packageEntitlementUsage: { entitlementId: entitlement._id, sourceOrderId: entitlement.sourceOrderId,
      ownerUserId: entitlement.ownerUserId, productId: product._id,
      poolKey: poolIndex >= 0 ? right.poolKey : '', rightIndex: index, reservedAt: now },
  });
  const remainingPath = poolIndex >= 0
    ? `rights.sharedEntitlementPools.${poolIndex}.remainingCount`
    : `rights.productEntitlements.${index}.remainingCount`;
  const result = await PackageEntitlement.updateOne({
    _id: entitlement._id, status: 'active', historyVerified: { $ne: false },
    validFrom: { $lte: now }, validUntil: { $gte: now }, [remainingPath]: { $gte: 1 },
  }, { $inc: { [remainingPath]: -1 }, $push: { usageRecords: {
    productId: product._id, productName: product.name, poolKey: poolIndex >= 0 ? right.poolKey : '',
    usedByUserId: user._id, executionOrderId: order._id, usedAt: now,
    status: 'reserved', note,
  } } });
  if (result.modifiedCount !== 1) {
    await Order.deleteOne({ _id: order._id, status: 'pending', 'packageEntitlementUsage.entitlementId': entitlement._id });
    return { status: 'retry' };
  }
  return { status: 'reserved', order, entitlement };
}

module.exports = { coveredRight, packageFirstOrder };
