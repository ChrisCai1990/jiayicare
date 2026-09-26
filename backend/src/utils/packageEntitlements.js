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

async function ensurePackageEntitlement(order) {
  const snapshot = order?.annualServiceSnapshot?.entitlementSnapshot;
  if (order?.orderType !== 'package' || order.paymentStatus !== 'paid' || !snapshot?.packageId || !order.user) return null;
  const validFrom = order.paidAt || new Date();
  const durationMonths = Math.max(1, Number(order.annualServiceSnapshot?.durationMonths) || 12);
  return PackageEntitlement.findOneAndUpdate(
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
