const { internalDaily } = require('./annualPlanPresentation');

function isStaffOnlyFollowUp(task, schemeName = '') {
  if (!task) return false;
  if (task.clientVisible === false) return true;
  // 旧年度排期把模板名拼在“标准随访 · ”之后，历史记录未保存 clientVisible。
  if (/^标准随访\s*·\s*【?日常跟进(?:与动态调整)?】?$/.test(String(task.theme || '').trim())) return true;
  return [task.theme, task.formData?.standardPlanName, schemeName, task.followUpSchemeId?.name]
    .some(name => internalDaily({ standardPlanName: name }));
}

async function isStaffOnlyFollowUpWithScheme(task) {
  if (isStaffOnlyFollowUp(task)) return true;
  if (!task?.followUpSchemeId) return false;
  const scheme = await require('../models/FollowUpPlan').findById(task.followUpSchemeId).select('name').lean();
  return isStaffOnlyFollowUp(task, scheme?.name);
}

module.exports = { isStaffOnlyFollowUp, isStaffOnlyFollowUpWithScheme };
