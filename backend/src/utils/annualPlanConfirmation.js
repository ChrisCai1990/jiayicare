async function confirmPublishedAnnualPlan(plan, now = new Date()) {
  if (!require('./healthManagementRollout').enabledForPatient(plan.patientId)) {
    // Existing customers retain the pre-rollout confirmation path; no new freeze or dispatch markers.
    if (!plan.confirmedAt) { plan.confirmedAt = now; await plan.save(); }
    return plan;
  }
  if (!plan.pushedAt || plan.reviewStatus !== 'approved') {
    throw Object.assign(new Error('方案尚未审核发布，不能确认或启动任务'), { statusCode: 409 });
  }
  if (!plan.confirmedAt) {
    plan.confirmedAt = now;
    plan.frozenAt = now;
    if (require('./annualCheckupDispatch').enabled()) plan.checkupPreparationAutoConfirmedAt = now;
    await plan.save();
  } else if (!plan.frozenAt) {
    plan.frozenAt = plan.confirmedAt;
    await plan.save();
  }
  return plan;
}

async function assertAnnualConfirmationAccess(plan, user) {
  if (!require('./healthManagementRollout').enabledForPatient(plan.patientId)) return;
  if (plan.continuitySource?.previousPlanId) return; // 仅续年方案可在服务空档提前确认。
  const access = await require('./serviceAccess').resolveServiceAccess(user);
  if (!access.active) throw Object.assign(new Error('服务期未生效，暂不能启动首次年度方案'), { statusCode: 403 });
}

module.exports = { confirmPublishedAnnualPlan, assertAnnualConfirmationAccess };
