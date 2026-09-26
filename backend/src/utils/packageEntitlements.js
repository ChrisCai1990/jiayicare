const PackageEntitlement = require('../models/PackageEntitlement');
const User = require('../models/User');

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
    const user = await User.findById(order.user).select('serviceStartDate').lean();
    const currentStart = user?.serviceStartDate ? new Date(`${user.serviceStartDate}T00:00:00+08:00`) : null;
    if (!currentStart || !Number.isFinite(currentStart.getTime()) || currentStart <= validFrom) {
      await User.updateOne({ _id: order.user }, { $set: {
        clientBrand: snapshot.clientBrand || 'jiayiguanjia',
        servicePackage: snapshot.packageName || order.serviceName || '',
        serviceStartDate: validFrom.toISOString().slice(0, 10),
        serviceExpiry: addMonths(validFrom, durationMonths).toISOString().slice(0, 10),
        ...(snapshot.membershipTypeName ? { memberType: snapshot.membershipTypeName } : {}),
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

module.exports = { ensurePackageEntitlement, applicableEntitlements, expirySweep };
