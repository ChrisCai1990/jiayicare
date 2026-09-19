async function confirmPublishedAnnualPlan(plan, now = new Date()) {
  if (!plan.pushedAt || plan.reviewStatus !== 'approved') {
    throw Object.assign(new Error('方案尚未审核发布，不能确认或启动任务'), { statusCode: 409 });
  }
  if (!plan.confirmedAt) {
    plan.confirmedAt = now;
    plan.frozenAt = now;
    await plan.save();
  } else if (!plan.frozenAt) {
    plan.frozenAt = plan.confirmedAt;
    await plan.save();
  }
  return plan;
}

module.exports = { confirmPublishedAnnualPlan };
