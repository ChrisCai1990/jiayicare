const PackageEntitlement = require('../models/PackageEntitlement');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const mongoose = require('mongoose');

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + Math.max(1, Number(months) || 12));
  return result;
}

function copy(value) {
  return value ? JSON.parse(JSON.stringify(value)) : {};
}

async function ensurePackageEntitlement(order, { syncCustomerMembership = false } = {}) {
  const snapshot = order?.annualServiceSnapshot?.entitlementSnapshot;
  if (order?.orderType !== 'package' || order.paymentStatus !== 'paid' || !snapshot?.packageId || !order.user) return null;
  const validFrom = order.paidAt || new Date();
  const durationMonths = Math.max(1, Number(order.annualServiceSnapshot?.durationMonths) || 12);
  const entitlement = await PackageEntitlement.findOneAndUpdate(
    { sourceOrderId: order._id },
    { $setOnInsert: {
      ownerUserId: order.user,
      tenantId: order.tenantId || null,
      sourceOrderId: order._id,
      packageId: snapshot.packageId,
      packageName: snapshot.packageName || order.serviceName || '',
      clientBrand: snapshot.clientBrand || 'jiayiguanjia',
      validFrom,
      validUntil: addMonths(validFrom, durationMonths),
      familySharing: !!snapshot.familySharing,
      rights: copy(snapshot),
    } },
    { upsert: true, new: true },
  );
  if (syncCustomerMembership) {
    const user = await User.findById(order.user).select('serviceStartDate membershipTier').lean();
    const currentStart = user?.serviceStartDate ? new Date(`${user.serviceStartDate}T00:00:00+08:00`) : null;
    if (!currentStart || !Number.isFinite(currentStart.getTime()) || currentStart <= validFrom) {
      await User.updateOne({ _id: order.user }, { $set: {
        clientBrand: snapshot.clientBrand || 'jiayiguanjia',
        servicePackage: snapshot.packageName || order.serviceName || '',
        serviceStartDate: validFrom.toISOString().slice(0, 10),
        serviceExpiry: addMonths(validFrom, durationMonths).toISOString().slice(0, 10),
        ...(snapshot.membershipTier ? { membershipTier: snapshot.membershipTier } : {}),
      } });
    }
  }
  return entitlement;
}

async function applicableEntitlements(patientId, now = new Date()) {
  const patient = await User.findById(patientId).select('familyLinks').lean();
  if (!patient) return [];
  const familyIds = (patient.familyLinks || []).map(item => item.linkedUser).filter(Boolean);
  const rows = await PackageEntitlement.find({
    status: 'active', validFrom: { $lte: now }, validUntil: { $gte: now },
    ownerUserId: { $in: [patient._id, ...familyIds] },
  }).sort({ validUntil: 1, createdAt: 1 }).lean();
  return rows.filter(row => String(row.ownerUserId) === String(patient._id) || row.familySharing);
}

function expirySweep(rows, now = new Date()) {
  const expired = rows.filter(row => new Date(row.validUntil) < now).map(row => row._id);
  if (expired.length) PackageEntitlement.updateMany({ _id: { $in: expired }, status: 'active' }, { $set: { status: 'expired' } }).catch(() => {});
  return rows.filter(row => new Date(row.validUntil) >= now && row.status === 'active');
}

// 阶段性评估、月度复盘等“系统交付动作”也必须对应一个商城产品。
// 发起动作时按最早到期的有效套餐自动寻找对应产品权益、原子扣减，并留下一张零元履约单。
async function consumeSystemServiceEntitlement(patient, systemService, { note = '' } = {}) {
  const allowed = new Set(['phase_assessment', 'monthly_service_review']);
  if (!allowed.has(systemService)) throw Object.assign(new Error('系统服务用途无效'), { statusCode: 400 });
  const now = new Date();
  const rows = await applicableEntitlements(patient._id, now);
  let matched = null;
  for (const entitlement of rows) {
    const productIndex = (entitlement.rights?.productEntitlements || []).findIndex(item => item.systemService === systemService);
    if (productIndex < 0) continue;
    const right = entitlement.rights.productEntitlements[productIndex];
    const poolIndex = right.poolKey ? (entitlement.rights?.sharedEntitlementPools || []).findIndex(pool => pool.key === right.poolKey) : -1;
    const remaining = poolIndex >= 0 ? Number(entitlement.rights.sharedEntitlementPools[poolIndex]?.remainingCount || 0) : Number(right.remainingCount || 0);
    if (remaining > 0) { matched = { entitlement, productIndex, poolIndex, right }; break; }
  }
  if (!matched) throw Object.assign(new Error('客户没有可用的对应套餐权益；请先在服务包中配置对应商城产品及次数，或按单次服务下单'), { statusCode: 409 });
  const product = await Product.findOne({ _id: matched.right.productId, status: 'on' }).lean();
  if (!product) throw Object.assign(new Error('对应商城产品已下架，暂不能发起此服务'), { statusCode: 409 });
  const serviceItems = (product.serviceItems || []).filter(item => item.name && Number(item.units) > 0);
  const totalUnits = serviceItems.length ? serviceItems.reduce((sum, item) => sum + Math.max(1, Number(item.units) || 1), 0) : 1;
  const executionOrder = await Order.create({
    user: patient._id, tenantId: patient.tenantId || null, serviceId: String(product._id), serviceName: product.name,
    servicePrice: 0, unitPrice: 0, totalUnits, usedUnits: 0,
    orderNo: `ENT${Date.now()}${new mongoose.Types.ObjectId().toString().slice(-6)}`.slice(0, 32),
    orderType: 'service', fulfillmentType: product.fulfillmentType || 'offline_service', status: 'pending', tradeStatus: 'paid', paymentStatus: 'paid', paidAmount: 0, paymentExpectedAmount: 0, paidAt: now, initiationSource: 'system',
    serviceItemsSnapshot: serviceItems.map(item => ({ key: item.key, name: item.name, units: item.units, usedUnits: 0, performers: item.performers || [] })),
    performanceRuleSnapshot: product.performanceRule || null, servicePerformerRolesSnapshot: product.servicePerformerRoles || [], serviceWorkflowSnapshot: product.serviceWorkflow || null,
    serviceProviderSnapshot: { code: product.serviceProvider || 'platform', companyName: '杭州嘉医汇健康管理有限公司' }, note,
    packageEntitlementUsage: { entitlementId: matched.entitlement._id, sourceOrderId: matched.entitlement.sourceOrderId, ownerUserId: matched.entitlement.ownerUserId, productId: product._id, poolKey: matched.poolIndex >= 0 ? matched.right.poolKey : '', usedAt: now },
  });
  const remainingPath = matched.poolIndex >= 0 ? `rights.sharedEntitlementPools.${matched.poolIndex}.remainingCount` : `rights.productEntitlements.${matched.productIndex}.remainingCount`;
  const updated = await PackageEntitlement.updateOne({ _id: matched.entitlement._id, status: 'active', validFrom: { $lte: now }, validUntil: { $gte: now }, updatedAt: matched.entitlement.updatedAt, [remainingPath]: { $gte: 1 } }, {
    $inc: { [remainingPath]: -1 },
    $push: { usageRecords: { productId: product._id, productName: product.name, poolKey: matched.poolIndex >= 0 ? matched.right.poolKey : '', usedByUserId: patient._id, executionOrderId: executionOrder._id, usedAt: now, note } },
  });
  if (updated.modifiedCount !== 1) {
    await Order.deleteOne({ _id: executionOrder._id, status: 'pending', paymentStatus: 'paid' });
    throw Object.assign(new Error('权益次数刚被其他操作使用，请刷新后重试'), { statusCode: 409 });
  }
  return { executionOrder, entitlementId: matched.entitlement._id, productId: product._id };
}

module.exports = { ensurePackageEntitlement, applicableEntitlements, expirySweep, consumeSystemServiceEntitlement };
