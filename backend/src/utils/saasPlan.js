const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const { runWithoutTenantScope } = require('./tenantScope');

const STANDARD_PLAN = Object.freeze({
  code: 'standard', monthlyPlatformYuan: 2980, setupYuan: 9800,
  activeClientLimit: 500, includedStaffSeats: 6, includedAdminSeats: 2,
  extraSeatMonthlyYuan: 80, aiMonthlyYuan: 499, aiIncludedSupplierCostYuan: 100,
});

const activeFilter = { staffStatus: { $ne: 'inactive' } };
const staffRoles = { $nin: ['superadmin', 'platformSuper', 'enterprise_hr'] };

async function seatUsage(tenantId) {
  const [staff, admins] = await Promise.all([
    runWithoutTenantScope(() => Admin.countDocuments({ tenantId, role: staffRoles, ...activeFilter })),
    runWithoutTenantScope(() => Admin.countDocuments({ tenantId, role: 'superadmin', ...activeFilter })),
  ]);
  return { staff, admins };
}

async function seatCapacity(tenantId, kind) {
  const tenant = await Tenant.findById(tenantId).lean();
  if (!tenant || tenant.commercialPlan !== 'standard') return { applicable: false };
  const usage = await seatUsage(tenantId);
  const limit = kind === 'admin'
    ? STANDARD_PLAN.includedAdminSeats + (tenant.extraAdminSeats || 0)
    : STANDARD_PLAN.includedStaffSeats + (tenant.extraStaffSeats || 0);
  return { applicable: true, limit, used: usage[kind === 'admin' ? 'admins' : 'staff'], tenant };
}

async function canAddSeat(tenantId, kind) {
  const capacity = await seatCapacity(tenantId, kind);
  return !capacity.applicable || capacity.used < capacity.limit;
}

function estimatedMonthlySeatFee(usage) {
  return (Math.max(0, usage.staff - STANDARD_PLAN.includedStaffSeats)
    + Math.max(0, usage.admins - STANDARD_PLAN.includedAdminSeats)) * STANDARD_PLAN.extraSeatMonthlyYuan;
}

module.exports = { STANDARD_PLAN, seatUsage, seatCapacity, canAddSeat, estimatedMonthlySeatFee };
