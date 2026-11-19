const User = require('../models/User');
const AnnualPlan = require('../models/AnnualPlan');
const ServicePackage = require('../models/ServicePackage');
const MedicalReport = require('../models/MedicalReport');
const AIHealthCheckupReview = require('../models/AIHealthCheckupReview');
const { approvedItems } = require('./aiHealthCheckupItems');
const { matchesAnnualCustomer } = require('./researchAnnualCustomer');
const { resolveServiceAccess, chinaDay } = require('./serviceAccess');
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
  return `/patients/${patientId}?tab=${target}&workflowStep=${key}&annualWorkflowYear=${year}${hash}`;
}

function workflowYear(patientId, access, now, plans) {
  const currentYear = Number(chinaDay(now).slice(0, 4));
  if (plans.some(plan => String(plan.patientId) === String(patientId) && Number(plan.year) === currentYear
    && (plan.pushedAt || plan.confirmedAt || plan.formalizedAt))) return currentYear;
  return planYear(access, now);
}

function project(patient, year, plans, reports, now = new Date(), aiReviews = []) {
  const id = String(patient._id);
  const plan = plans.filter(row => String(row.patientId) === id && Number(row.year) === Number(year))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))[0];
  const currentReports = reports.filter(row => String(row.user) === id && row.audit_status === 'audited' && !row.archiveOnly
    && !['prescription_order', 'outpatient_record'].includes(row.documentCategory));
  const pending = currentReports.filter(row => !row.advisorInterpretationConfirmedAt
    && row.advisorCorrection?.status !== 'returned');
  const hasCurrentExam = require('./annualReviewEligibility').eligibility(currentReports, now, { lookbackMonths: 12 }).allowed;
  const planConfirmed = Boolean(plan?.confirmedAt);
  const planReleased = Boolean(plan?.pushedAt || planConfirmed);
  const checkup = approvedItems(patient.aiHealthSummary, year);
  const screeningConfirmed = !pending.length && checkup.items.every(item => aiReviews.some(row =>
    String(row.patientId) === id && Number(row.year) === Number(year)
    && row.sourceVersion === checkup.version && row.sourceKey === item.sourceKey && row.itemText === item.text));
  const hasGoals = Boolean((plan?.moduleData?.management_targets?.records || []).length
    || require('./annualStandardGoals').fromPlan(plan).length);
  const missingPilotGoals = planConfirmed && require('./annualFlowPilot').enabledForPlan(plan) && !hasGoals;
  const draftWithoutGoals = plan && !plan.pushedAt && !hasGoals;
  const step = pending.length ? 'interpretation' : !hasCurrentExam && !planReleased ? 'preparation'
    : missingPilotGoals ? 'goals' : planReleased ? 'execution' : plan ? (draftWithoutGoals ? 'goals' : 'plan')
      : screeningConfirmed ? 'goals' : 'screening';
  const label = { preparation: '年度资料待准备', interpretation: '年度报告待解读', screening: '当前筛查待核对',
    goals: '年度目标待确认', plan: plan?.pushedAt ? '年度方案待确认' : '年度方案待审核', execution: '年度管理执行与随访' }[step];
  const details = steps.map(item => ({ key: item[0], label: item[1], link: stepLink(id, year, item),
    status: item[0] === 'preparation' ? hasCurrentExam ? 'complete' : step === 'preparation' ? 'active' : 'waiting'
      : item[0] === 'interpretation' ? pending.length ? 'pending' : currentReports.length ? 'complete' : 'waiting'
      : item[0] === 'screening' ? screeningConfirmed ? 'complete' : step === 'screening' ? 'active' : 'available'
      : item[0] === 'goals' ? hasGoals ? 'complete' : step === 'goals' ? 'active' : 'available'
      : item[0] === 'plan' ? planReleased ? 'complete' : plan ? 'pending' : 'waiting'
      : item[0] === 'execution' ? planReleased ? 'active' : 'waiting'
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
      : step === 'execution' ? `${year}年度 · 方案已推送${planConfirmed ? '' : '、待客户确认'}，查看随访及专业服务进度`
      : `${year}年度 · 从当前步骤继续办理`,
    priority: 2, createdAt, overdue: step !== 'execution' && step !== 'preparation' && now - new Date(createdAt) > 3 * DAY,
    link: `/patients/${id}/annual-workflow?year=${year}` };
}

async function load(staff, now = new Date(), deps = {}, onlyPatientId = '', includeExecution = false) {
  if (!['familyDoctor', 'superadmin'].includes(staff.role)) return [];
  const filter = { isDeleted: { $ne: true }, ...(onlyPatientId ? { _id: onlyPatientId } : {}),
    ...(staff.role === 'familyDoctor' ? { assignedFamilyDoctor: staff._id } : {}),
    ...(staff.tenantId ? { tenantId: staff.tenantId } : {}) };
  const users = await (deps.User || User).find(filter)
    .select('_id name membershipTier servicePackage clientBrand enterpriseId serviceStartDate serviceExpiry createdAt tenantId assignedFamilyDoctor aiHealthSummary').lean();
  if (!users.length) return [];
  const [plans, packages] = await Promise.all([
    (deps.AnnualPlan || AnnualPlan).find({ patientId: { $in: users.map(user => user._id) } })
      .select('patientId year flowVersion createdAt updatedAt pushedAt confirmedAt formalizedAt reviewStatus moduleData.management_targets.records moduleData.medical_treatment moduleData.specialist_collab moduleData.checkup_completion moduleData.abnormal_followup moduleData.vaccine moduleData.annual_checkup').lean(),
    (deps.ServicePackage || ServicePackage).find({ 'configuration.membershipTier': 'annual' }).select('name clientBrand').lean(),
  ]);
  const withPlan = new Set(plans.map(plan => String(plan.patientId)));
  const eligible = [];
  for (let index = 0; index < users.length; index += 20) {
    const batch = await Promise.all(users.slice(index, index + 20).map(async user => {
      if (!matchesAnnualCustomer(user, withPlan.has(String(user._id)), packages)) return null;
      const access = await (deps.resolveServiceAccess || resolveServiceAccess)(user, now);
      return access.active ? { user, year: workflowYear(user._id, access, now, plans) } : null;
    }));
    eligible.push(...batch.filter(Boolean));
  }
  if (!eligible.length) return [];
  const reports = await (deps.MedicalReport || MedicalReport).find({ user: { $in: eligible.map(item => item.user._id) },
    audit_status: 'audited', archiveOnly: { $ne: true } })
    .select('user _id title type status documentCategory checkDate date audit_status screeningL1 screeningL2 screeningCategory reportItems.name reportItems.orderName reportItems.sourceSection examDescription examConclusion examMainConclusions advisorInterpretationConfirmedAt advisorCorrection.status audited_at updatedAt createdAt').lean();
  const reviews = await (deps.AIHealthCheckupReview || AIHealthCheckupReview).find({
    patientId: { $in: eligible.map(item => item.user._id) }, year: { $in: [...new Set(eligible.map(item => item.year))] },
  }).select('patientId year sourceVersion sourceKey itemText').lean();
  // A confirmed plan is already past the advisor's plan-building task. Execution has its own tasks.
  return eligible.map(({ user, year }) => project(user, year, plans, reports, now, reviews))
    .filter(flow => includeExecution || flow.step !== 'execution');
}

module.exports = { load, project, stepLink, steps, workflowYear };
