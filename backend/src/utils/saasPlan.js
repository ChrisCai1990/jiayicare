const Admin = require('../models/Admin');
const Tenant = require('../models/Tenant');
const SystemConfig = require('../models/SystemConfig');
const { runWithoutTenantScope } = require('./tenantScope');

const STANDARD_PLAN = Object.freeze({
  code: 'standard', monthlyPlatformYuan: 2980, setupYuan: 9800,
  activeClientLimit: 500, includedStaffSeats: 6, includedAdminSeats: 2,
  extraSeatMonthlyYuan: 80, aiMonthlyYuan: 499, aiIncludedSupplierCostYuan: 100,
});
const PLAN_KEY = 'saas_standard_commercial_plan';
const integerFields = ['activeClientLimit', 'includedStaffSeats', 'includedAdminSeats'];
const moneyFields = ['monthlyPlatformYuan', 'setupYuan', 'extraSeatMonthlyYuan', 'aiMonthlyYuan', 'aiIncludedSupplierCostYuan'];

function validatePlan(input) {
  const plan = { code: 'standard' };
  for (const key of [...integerFields, ...moneyFields]) {
    const raw = input?.[key];
    if (raw === '' || raw === null || raw === undefined) throw new Error(`${key}不能为空`);
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 1000000) throw new Error(`${key}超出允许范围`);
    if (integerFields.includes(key) && (!Number.isInteger(value) || value < 1)) throw new Error(`${key}必须是正整数`);
    plan[key] = value;
  }
  return plan;
}

async function getStandardPlan() {
  const record = await SystemConfig.findOne({ key: PLAN_KEY }).lean();
  return record?.value ? { ...STANDARD_PLAN, ...record.value, code: 'standard' } : { ...STANDARD_PLAN };
}

function tenantTerms(tenant) {
  return tenant?.commercialTerms ? { ...STANDARD_PLAN, ...tenant.commercialTerms, code: 'standard' } : { ...STANDARD_PLAN };
}

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
  const terms = tenantTerms(tenant);
  const limit = kind === 'admin'
    ? terms.includedAdminSeats + (tenant.extraAdminSeats || 0)
    : terms.includedStaffSeats + (tenant.extraStaffSeats || 0);
  return { applicable: true, limit, used: usage[kind === 'admin' ? 'admins' : 'staff'], tenant, terms };
}

async function canAddSeat(tenantId, kind) {
  const capacity = await seatCapacity(tenantId, kind);
  return !capacity.applicable || capacity.used < capacity.limit;
}

function estimatedMonthlySeatFee(usage, terms = STANDARD_PLAN) {
  return (Math.max(0, usage.staff - terms.includedStaffSeats)
    + Math.max(0, usage.admins - terms.includedAdminSeats)) * terms.extraSeatMonthlyYuan;
}

module.exports = { STANDARD_PLAN, PLAN_KEY, validatePlan, getStandardPlan, tenantTerms, seatUsage, seatCapacity, canAddSeat, estimatedMonthlySeatFee };
