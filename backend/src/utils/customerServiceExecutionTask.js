const { isStaffOnlyFollowUp } = require('./staffOnlyFollowUp');

// 与 /user/followup-tasks 的岗位任务排除口径保持一致；历史已完成任务也可展示。
function isCustomerServiceExecutionTask(task) {
  if (!task || isStaffOnlyFollowUp(task) || task.aiStatus === 'pending' || task.isBlocked === true) return false;
  if (task.workflowKey === 'medication:staff-followup' || /^nutrition:/.test(task.workflowKey || '')) return false;
  if (['annual_service', 'annual_coordination', 'annual_preparation', 'ai_no_response'].includes(task.sourceType)) return false;
  if (task.sourceType === 'order' && !/^medical_reminder:(?:followup|documents)$/.test(task.workflowKey || '')) return false;
  if (task.sourceType === 'health_plan' && ['executor', 'supervisor'].includes(task.taskRole)) return false;
  if (['professional_assessment', 'report_followup'].includes(task.sourceType) && ['executor', 'supervisor'].includes(task.taskRole)) return false;
  return true;
}

module.exports = { isCustomerServiceExecutionTask };
