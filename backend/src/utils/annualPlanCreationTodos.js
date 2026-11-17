const User = require('../models/User');
const AnnualPlan = require('../models/AnnualPlan');
const ServicePackage = require('../models/ServicePackage');
const MedicalReport = require('../models/MedicalReport');
const { matchesAnnualCustomer } = require('./researchAnnualCustomer');
const { resolveServiceAccess, chinaDay } = require('./serviceAccess');
const { eligibility } = require('./annualReviewEligibility');

const DAY = 24 * 60 * 60 * 1000;

function planYear(access, now) {
  const start = access.startDate || '';
  const currentYear = Number(chinaDay(now).slice(0, 4));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return currentYear;
  // A legacy profile can span several years; only a genuine current service
  // year should inherit its starting year.
  const age = now - new Date(`${start}T00:00:00+08:00`);
  return age >= 0 && age <= 366 * DAY ? Number(start.slice(0, 4)) : currentYear;
}

function buildTodo(patient, year, plans, now) {
  const current = plans.filter(plan => String(plan.patientId) === String(patient._id) && plan.year === year);
  if (current.some(plan => plan.pushedAt || plan.confirmedAt || plan.formalizedAt)) return null;
  const draft = current.length > 0;
  const createdAt = draft ? (() => {
    const latest = current.reduce((a, b) => new Date(b.updatedAt || b.createdAt || 0) > new Date(a.updatedAt || a.createdAt || 0) ? b : a);
    return latest.updatedAt || latest.createdAt || now;
  })()
    : patient.serviceStartDate || patient.createdAt || now;
  const id = String(patient._id);
  return {
    id: `annual_plan_create_${id}_${year}`, type: 'annual_plan_create',
    label: draft ? '年度管理方案草稿待完成' : '年度管理方案待建立', priority: 2,
    patientId: id, patientName: patient.name || '未知',
    summary: `${year}年度 · ${draft ? '已有草稿，请完善并审核推送' : '年度会员尚未建立管理方案，请核对资料后建立'}`,
    createdAt, overdue: now - new Date(createdAt) > 3 * DAY,
    link: `/patients/${id}/annual-health?year=${year}`,
  };
}

// Workbench reads must not create business records. Project the advisor's current
// annual members from their existing membership and service-period evidence.
async function loadAnnualPlanCreationTodos(staff, now = new Date(), deps = {}) {
  if (staff.role !== 'familyDoctor') return [];
  const users = await (deps.User || User).find({ assignedFamilyDoctor: staff._id, isDeleted: { $ne: true } })
    .select('_id name membershipTier servicePackage clientBrand enterpriseId serviceStartDate serviceExpiry createdAt isDeleted')
    .lean();
  if (!users.length) return [];
  const [plans, annualPackages] = await Promise.all([
    (deps.AnnualPlan || AnnualPlan).find({ patientId: { $in: users.map(user => user._id) } })
      .select('patientId year createdAt updatedAt pushedAt confirmedAt formalizedAt').lean(),
    (deps.ServicePackage || ServicePackage).find({ 'configuration.membershipTier': 'annual' })
      .select('name clientBrand').lean(),
  ]);
  const patientIdsWithPlan = new Set(plans.map(plan => String(plan.patientId)));
  const eligible = [];
  for (let index = 0; index < users.length; index += 20) {
    const batch = await Promise.all(users.slice(index, index + 20).map(async patient => {
      if (!matchesAnnualCustomer(patient, patientIdsWithPlan.has(String(patient._id)), annualPackages)) return null;
      const access = await (deps.resolveServiceAccess || resolveServiceAccess)(patient, now);
      return access.active ? { patient, year: planYear(access, now) } : null;
    }));
    eligible.push(...batch.filter(Boolean));
  }
  if (!eligible.length) return [];
  const candidates = eligible.map(({ patient, year }) => buildTodo(patient, year, plans, now)).filter(Boolean);
  if (!candidates.length) return [];
  const reports = await (deps.MedicalReport || MedicalReport).find({
    user: { $in: candidates.map(todo => todo.patientId) },
    audit_status: 'audited', archiveOnly: { $ne: true },
  }).select('user _id title type documentCategory checkDate date audit_status screeningL1 screeningL2 screeningCategory reportItems.name reportItems.orderName reportItems.sourceSection examDescription examConclusion examMainConclusions advisorInterpretationConfirmedAt').lean();
  const byPatient = new Map();
  reports.forEach(report => {
    const id = String(report.user);
    if (!byPatient.has(id)) byPatient.set(id, []);
    byPatient.get(id).push(report);
  });
  return candidates.filter(todo => eligibility(byPatient.get(todo.patientId) || [], now, { lookbackMonths: 3 }).allowed);
}

module.exports = { loadAnnualPlanCreationTodos, buildTodo, planYear };
