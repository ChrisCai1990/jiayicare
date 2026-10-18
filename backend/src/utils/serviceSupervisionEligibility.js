// A plan with no service tasks and a one-off annual reminder have no service
// workflow to supervise. They remain available in plans and follow-up tasks.
function belongsInServiceProgress(group) {
  if (group.type === 'plan' && group.tasks.length === 0) return false;
  if (group.type === 'followup' && group.tasks.length > 0 && group.tasks.every(task => task.sourceType === 'ai_review')) return false;
  if (group.type === 'followup' && group.tasks.length > 0 && group.tasks.every(task =>
    task.sourceAnnualPlanId && task.sourceType === 'scheduled' && task.deliveryMode === 'reminder')) return false;
  return true;
}

module.exports = { belongsInServiceProgress };
