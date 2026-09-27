const PackageEntitlement = require('../models/PackageEntitlement');
const User = require('../models/User');
const mongoose = require('mongoose');
const { buildPackageEntitlementSnapshot } = require('./packageEntitlementSnapshot');

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

// 组合包也是付费订单的权益台账，但不属于年度服务模板。每个选中的商城
// 服务都保留为独立 productEntitlements，医护端发起服务时即可准确匹配并
// 按最早到期权益扣减。
async function ensureMemberBundleEntitlement(order) {
  const snapshot = order?.annualServiceSnapshot?.memberBundleSnapshot;
  if (order?.paymentStatus !== 'paid' || !snapshot?.productId || !order.user) return null;
  const validFrom = order.paidAt || new Date();
  const validUntil = new Date(validFrom.getTime() + Math.max(1, Number(snapshot.validityDays) || 730) * 86400000);
  return PackageEntitlement.findOneAndUpdate(
    { sourceOrderId: order._id },
    { $setOnInsert: {
      ownerUserId: order.user, tenantId: order.tenantId || null, sourceOrderId: order._id,
      packageId: null, packageName: snapshot.name || order.serviceName || '会员专享服务包',
      clientBrand: snapshot.clientBrand || 'jiayiguanjia', validFrom, validUntil,
      familySharing: false,
      rights: { productEntitlements: copy(snapshot.productEntitlements || []), memberBundle: {
        productId: snapshot.productId, transferRemainingOnce: snapshot.transferRemainingOnce === true,
        transferredAt: null, transferredToUserId: null,
      } },
    } },
    { upsert: true, new: true },
  );
}

// 企业合同直接引用服务包模板。授予时冻结模板，后续改模板不会反向改写员工
// 已生效权益；同一企业、成员、服务包重复关联时复用原台账，不重复发放次数。
async function grantEnterprisePackageEntitlement({ enterprise, userId, servicePackage }) {
  if (!enterprise?._id || !userId || !servicePackage?._id) throw new Error('企业服务包授予参数不完整');
  if (enterprise.status !== 'active') throw new Error('企业合同未处于合作中，不能授予服务权益');
  const snapshot = await buildPackageEntitlementSnapshot(servicePackage);
  const now = new Date();
  const validFrom = enterprise.contractStartAt ? new Date(enterprise.contractStartAt) : now;
  const durationMonths = Math.max(1, Number(servicePackage.activation?.durationMonths) || 12);
  const validUntil = enterprise.contractEndAt ? new Date(enterprise.contractEndAt) : addMonths(validFrom, durationMonths);
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validUntil.getTime()) || validUntil < validFrom) {
    throw new Error('企业合同有效期无效，无法授予服务权益');
  }
  const filter = {
    sourceType: 'enterprise_contract',
    sourceEnterpriseId: enterprise._id,
    ownerUserId: userId,
    packageId: servicePackage._id,
  };
  let entitlement = await PackageEntitlement.findOne(filter);
  if (!entitlement) {
    entitlement = await PackageEntitlement.create({
      ownerUserId: userId,
      sourceOrderId: new mongoose.Types.ObjectId(), // 企业合同来源的内部幂等标识，不代表商城订单
      sourceType: 'enterprise_contract',
      sourceEnterpriseId: enterprise._id,
      packageId: servicePackage._id,
      packageName: snapshot.packageName || servicePackage.name,
      clientBrand: snapshot.clientBrand || servicePackage.clientBrand || 'jiayiguanjia',
      validFrom,
      validUntil,
      familySharing: !!snapshot.familySharing,
      rights: copy(snapshot),
    });
  }
  const current = await User.findById(userId).select('serviceStartDate').lean();
  const currentStart = current?.serviceStartDate ? new Date(`${current.serviceStartDate}T00:00:00+08:00`) : null;
  if (!currentStart || !Number.isFinite(currentStart.getTime()) || currentStart <= validFrom) {
    await User.updateOne({ _id: userId }, { $set: {
      clientBrand: snapshot.clientBrand || servicePackage.clientBrand || 'jiayiguanjia',
      servicePackage: snapshot.packageName || servicePackage.name,
      serviceStartDate: validFrom.toISOString().slice(0, 10),
      serviceExpiry: validUntil.toISOString().slice(0, 10),
      ...(snapshot.membershipTier ? { membershipTier: snapshot.membershipTier } : {}),
    } });
  }
  return entitlement;
}

async function cancelEnterprisePackageEntitlements(enterpriseId, userId) {
  return PackageEntitlement.updateMany(
    { sourceType: 'enterprise_contract', sourceEnterpriseId: enterpriseId, ownerUserId: userId, status: 'active' },
    { $set: { status: 'cancelled' } },
  );
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

module.exports = { ensurePackageEntitlement, ensureMemberBundleEntitlement, grantEnterprisePackageEntitlement, cancelEnterprisePackageEntitlements, applicableEntitlements, expirySweep };
