const { buildAnnualCheckupPreparation } = require('./annualCheckupPreparation');
const { preparationRole, assertPreparationOwner, checkupPlanReady, plannerEvidence } = require('./annualCheckupEvidence');
const idOf = value => String(value?._id || value || '');
const time = value => value ? new Date(value).getTime() : NaN;

// Read-only convergence. Ready means evidence is sufficient to select an existing
// service, NOT permission to purchase, book, or run the legacy latest-service fallback.
function evaluateReadiness({ annual, patient, gate, tasks, plan, now = new Date() }) {
  const window = buildAnnualCheckupPreparation(annual, patient, gate, now);
  const result = { state: 'preparing', targetDate: window.targetDate, readyForServiceLink: false,
    serviceStarted: false, issues: [...window.issues], roles: [] };
  if (window.state !== 'due' || window.issues.length) return { ...result, state: 'blocked', issues: result.issues.length ? result.issues
    : [{ code: 'outside_preparation_window', role: 'familyDoctor', message: '尚未进入有效准备窗口，请核对年度排期' }] };
  const matched = {};
  for (const candidate of window.tasks) {
    const role = candidate.formData.annualCheckupPreparation.role;
    const rows = tasks.filter(task => task.sourceScheduleKey === candidate.sourceScheduleKey
      && idOf(task.sourceAnnualPlanId) === idOf(annual._id) && idOf(task.patientId) === idOf(patient._id));
    const issue = (code, message) => { result.issues.push({ code, message, role }); result.roles.push({ role, state: 'blocked' }); };
    // Do not guess which duplicate is authoritative, including cancelled copies.
    if (rows.length !== 1) { issue(rows.length ? 'duplicate_preparation' : 'missing_preparation', rows.length ? '同岗位准备记录重复，请核对' : '该岗位准备任务尚未建立'); continue; }
    const task = rows[0];
    if (preparationRole(task) !== role || idOf(task.assignedTo) !== idOf(candidate.assignedTo)
      || task.formData.annualCheckupPreparation.targetDate !== window.targetDate || task.isBlocked || task.serviceTracking?.linkId) {
      issue('preparation_changed', '准备日期、负责人或关联状态已变化，请核对'); continue;
    }
    if (task.status !== 'completed' || !Number.isFinite(time(task.completedAt)) || time(task.completedAt) > time(now)) {
      issue('preparation_incomplete', task.status === 'cancelled' ? '准备任务已取消，请核对' : '该岗位尚未保存完整准备结果'); continue;
    }
    matched[role] = task;
    result.roles.push({ role, taskId: idOf(task._id), state: 'completed' });
  }
  const advisor = matched.familyDoctor;
  const planner = matched.healthPlanner;
  if (advisor) {
    const selected = advisor.formData.annualCheckupPreparation.evidence?.healthPlanId;
    if (!selected || idOf(plan?._id) !== idOf(selected) || !checkupPlanReady(plan, advisor, annual)
      || idOf(plan.preparationTaskId) !== idOf(advisor._id) || plan.content?.targetCheckupDate !== window.targetDate
      || !Number.isFinite(time(plan.pushedAt))
      || !Number.isFinite(time(plan.content.reviewedAt || plan.content.aiApprovedAt))) {
      result.issues.push({ code: 'plan_not_current', role: 'familyDoctor', message: '当前体检方案未有效审核发布、来源不符或日期已变化' });
    } else {
      result.plan = { id: idOf(plan._id), title: plan.title || '', publishedAt: plan.pushedAt, confirmedAt: plan.confirmedAt || null };
      if (!Number.isFinite(time(plan.confirmedAt)) || time(plan.confirmedAt) < time(plan.pushedAt) || time(plan.confirmedAt) > time(now)) {
        result.issues.push({ code: 'customer_confirmation_pending', role: 'healthPlanner', message: '等待客户确认本次已发布体检方案，不另建客户打卡任务' });
      }
    }
  }
  if (planner) {
    const evidence = planner.formData.annualCheckupPreparation.evidence;
    try {
      const resources = plannerEvidence(evidence || {}, planner, now);
      if (!evidence.recordedBy || !Number.isFinite(time(evidence.recordedAt)) || time(evidence.recordedAt) > time(now)) throw new Error('missing proof');
      result.resources = { date: resources.date, institution: resources.institution, recordedAt: evidence.recordedAt };
    } catch {
      result.issues.push({ code: 'resources_not_current', role: 'healthPlanner', message: '客户时间及机构资源准备凭据不完整或失效，请核对' });
    }
  }
  if (!result.issues.length) return { ...result, state: 'ready_for_service_link', readyForServiceLink: true };
  if (result.issues.every(issue => issue.code === 'customer_confirmation_pending')) result.state = 'awaiting_customer';
  return result;
}

async function loadReadiness(taskId, actor, models, gateFor, now = new Date()) {
  const task = await models.FollowUp.findById(taskId).lean();
  assertPreparationOwner(task, actor);
  const annual = await models.AnnualPlan.findById(task.sourceAnnualPlanId).lean();
  const patient = await models.User.findById(task.patientId).lean();
  const gate = await gateFor(annual, patient, now);
  const window = buildAnnualCheckupPreparation(annual, patient, gate, now);
  if (window.tasks.length && !window.tasks.some(row => row.sourceScheduleKey === task.sourceScheduleKey)) {
    throw Object.assign(new Error('该任务不属于当前年度体检准备排期，请核对'), { statusCode: 409 });
  }
  // Exact annual+patient+frozen schedule identity; never pair by latest date/title.
  const tasks = window.tasks.length ? await models.FollowUp.find({ patientId: task.patientId, sourceAnnualPlanId: task.sourceAnnualPlanId,
    sourceScheduleKey: { $in: window.tasks.map(row => row.sourceScheduleKey) } }).lean() : [];
  const advisors = tasks.filter(row => preparationRole(row) === 'familyDoctor');
  const selected = advisors.length === 1 ? advisors[0].formData.annualCheckupPreparation.evidence?.healthPlanId : null;
  const plan = selected ? await models.HealthPlan.findById(selected).lean() : null;
  const fresh = await models.FollowUp.findById(taskId).lean();
  assertPreparationOwner(fresh, actor);
  if (idOf(fresh.patientId) !== idOf(task.patientId) || idOf(fresh.sourceAnnualPlanId) !== idOf(task.sourceAnnualPlanId)
    || fresh.sourceScheduleKey !== task.sourceScheduleKey) throw Object.assign(new Error('准备来源已变化，请刷新'), { statusCode: 409 });
  return evaluateReadiness({ annual, patient, gate, tasks, plan, now });
}
module.exports = { evaluateReadiness, loadReadiness };
