const User = require('../models/User');
const AnnualPlan = require('../models/AnnualPlan');
const ServicePackage = require('../models/ServicePackage');
const MedicalReport = require('../models/MedicalReport');
const AnnualPlanPreparation = require('../models/AnnualPlanPreparation');
const { matchesAnnualCustomer } = require('./researchAnnualCustomer');
const { resolveServiceAccess } = require('./serviceAccess');
const { planYear } = require('./annualPlanCreationTodos');

const DAY = 24 * 60 * 60 * 1000;
const steps = [
  ['preparation', '资料准备', 'reports', '#annual-workflow-preparation'],
  ['interpretation', '报告解读', 'reports', '#annual-report-interpretation'],
  ['screening', '当前筛查核对', 'ai', '#screening-results'],
  ['goals', '管理问题与目标', 'annual-health', '#annual-management-goals'],
  ['plan', '年度方案审核', 'annual-health', '#annual-plan-actions'],
  ['execution', '执行与随访', 'followups', '#annual-workflow-execution'],
  ['assessment', '阶段性评估', 'aiReview', '#annual-workflow-assessment'],
];

function stepLink(patientId, year, step) {
  const [key, , target, hash] = step;
  if (target === 'annual-health') return `/patients/${patientId}/annual-health?year=${year}${hash}`;
  return `/patients/${patientId}?tab=${target}&workflowStep=${key}${hash}`;
}

function project(patient, year, plans, reports, now = new Date(), preparations = []) {
  const id = String(patient._id);
  const plan = plans.filter(row => String(row.patientId) === id && Number(row.year) === Number(year))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  const currentReports = reports.filter(row => String(row.user) === id && row.audit_status === 'audited' && !row.archiveOnly
    && !['prescription_order', 'outpatient_record'].includes(row.documentCategory));
  const pending = currentReports.filter(row => !row.advisorInterpretationConfirmedAt && row.status === 'pending');
  const hasCurrentExam = require('./annualReviewEligibility').eligibility(currentReports, now, { lookbackMonths: 12 }).allowed;
  const planConfirmed = Boolean(plan?.confirmedAt);
  const preparation = preparations.find(row => String(row.patientId) === id && Number(row.year) === Number(year));
  const screeningConfirmed = Boolean(preparation?.screeningConfirmedAt) && currentReports.every(row =>
    new Date(row.updatedAt || row.audited_at || row.createdAt || 0) <= new Date(preparation.screeningConfirmedAt));
  const missingPilotGoals = planConfirmed && require('./annualFlowPilot').enabled(id)
    && !(plan.moduleData?.management_targets?.records || []).length;
  const draftWithoutGoals = plan && !plan.pushedAt && !(plan.moduleData?.management_targets?.records || []).length;
  const step = pending.length ? 'interpretation' : !hasCurrentExam && !plan?.pushedAt ? 'preparation'
    : missingPilotGoals ? 'goals' : planConfirmed ? 'execution' : plan?.pushedAt ? 'plan' : plan ? (draftWithoutGoals ? 'goals' : 'plan')
      : screeningConfirmed ? 'goals' : 'screening';
  const label = { preparation: '年度资料待准备', interpretation: '年度报告待解读', screening: '当前筛查待核对',
    goals: '年度目标待确认', plan: plan?.pushedAt ? '年度方案待确认' : '年度方案待审核', execution: '年度管理执行与随访' }[step];
  const details = steps.map(item => ({ key: item[0], label: item[1], link: stepLink(id, year, item),
    status: item[0] === 'preparation' ? hasCurrentExam ? 'complete' : step === 'preparation' ? 'active' : 'waiting'
      : item[0] === 'interpretation' ? pending.length ? 'pending' : currentReports.length ? 'complete' : 'waiting'
      : item[0] === 'screening' ? screeningConfirmed ? 'complete' : step === 'screening' ? 'active' : 'available'
      : item[0] === 'goals' ? (plan?.moduleData?.management_targets?.records || []).length ? 'complete' : step === 'goals' ? 'active' : 'available'
      : item[0] === 'plan' ? planConfirmed ? 'complete' : plan?.pushedAt ? 'waiting' : plan ? 'pending' : 'waiting'
      : item[0] === 'execution' ? planConfirmed ? 'active' : 'waiting'
      : item[0] === 'assessment' ? planConfirmed ? 'available' : 'waiting'
      : item[0] === step ? 'active' : 'available' }));
  const createdAt = pending.length ? pending.reduce((date, row) => {
    const next = row.audited_at || row.updatedAt || row.createdAt || now;
    return new Date(next) < new Date(date) ? next : date;
  }, now) : plan?.updatedAt || patient.serviceStartDate || patient.createdAt || now;
  return { id: `annual_workflow_${id}_${year}`, type: 'annual_workflow', patientId: id,
    patientName: patient.name || '未知', year, planId: plan?._id || null, step, steps: details,
    label, summary: pending.length ? `${year}年度 · ${pending.length}份报告待解读，完成后继续筛查和方案核对`
      : step === 'preparation' ? `${year}年度 · 核对完整体检资料及审核状态`
      : step === 'execution' ? `${year}年度 · 方案已确认，查看随访及专业服务进度`
      : `${year}年度 · 从当前步骤继续办理`,
    priority: 2, createdAt, overdue: step !== 'execution' && step !== 'preparation' && now - new Date(createdAt) > 3 * DAY,
    link: `/patients/${id}/annual-workflow?year=${year}` };
}

async function load(staff, now = new Date(), deps = {}, onlyPatientId = '') {
  if (!['familyDoctor', 'superadmin'].includes(staff.role)) return [];
  const filter = { isDeleted: { $ne: true }, ...(onlyPatientId ? { _id: onlyPatientId } : {}),
    ...(staff.role === 'familyDoctor' ? { assignedFamilyDoctor: staff._id } : {}),
    ...(staff.tenantId ? { tenantId: staff.tenantId } : {}) };
  const users = await (deps.User || User).find(filter)
    .select('_id name membershipTier servicePackage clientBrand enterpriseId serviceStartDate serviceExpiry createdAt tenantId assignedFamilyDoctor').lean();
  if (!users.length) return [];
  const [plans, packages, preparations] = await Promise.all([
    (deps.AnnualPlan || AnnualPlan).find({ patientId: { $in: users.map(user => user._id) } })
      .select('patientId year createdAt updatedAt pushedAt confirmedAt formalizedAt reviewStatus moduleData.management_targets.records').lean(),
    (deps.ServicePackage || ServicePackage).find({ 'configuration.membershipTier': 'annual' }).select('name clientBrand').lean(),
    (deps.AnnualPlanPreparation || AnnualPlanPreparation).find({ patientId: { $in: users.map(user => user._id) } })
      .select('patientId year screeningConfirmedAt').lean(),
  ]);
  const withPlan = new Set(plans.map(plan => String(plan.patientId)));
  const eligible = [];
  for (let index = 0; index < users.length; index += 20) {
    const batch = await Promise.all(users.slice(index, index + 20).map(async user => {
      if (!matchesAnnualCustomer(user, withPlan.has(String(user._id)), packages)) return null;
      const access = await (deps.resolveServiceAccess || resolveServiceAccess)(user, now);
      return access.active ? { user, year: planYear(access, now) } : null;
    }));
    eligible.push(...batch.filter(Boolean));
  }
  if (!eligible.length) return [];
  const reports = await (deps.MedicalReport || MedicalReport).find({ user: { $in: eligible.map(item => item.user._id) },
    audit_status: 'audited', archiveOnly: { $ne: true } })
    .select('user _id title type status documentCategory checkDate date audit_status screeningL1 screeningL2 screeningCategory reportItems.name reportItems.orderName reportItems.sourceSection examDescription examConclusion examMainConclusions advisorInterpretationConfirmedAt audited_at updatedAt createdAt').lean();
  return eligible.map(({ user, year }) => project(user, year, plans, reports, now, preparations));
}

module.exports = { load, project, stepLink, steps };
