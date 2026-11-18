const DEFAULTS = {
  medical_treatment: '及时完成就医，明确诊治方案',
  specialist_collab: '完成专家会诊，明确后续诊治方案',
  checkup_completion: '完成检查，明确结果与后续处理方向',
  abnormal_followup: '按计划完成复查，明确变化与后续管理措施',
  vaccine: '核实接种适宜性，按确认的方案完成接种',
  annual_checkup: '按计划完成年度体检，核对重点项目结果',
};

function fromPlan(plan) {
  const rows = [];
  for (const [key, fallbackGoal] of Object.entries(DEFAULTS)) {
    const module = plan?.moduleData?.[key];
    if (!module || module.enabled === false) continue;
    const records = Array.isArray(module.records) ? module.records : key === 'annual_checkup' ? [module] : [];
    for (const [index, action] of records.entries()) {
      if (!action || !Object.keys(action).length) continue;
      const sourceIds = [...new Set((action.sourceIds || []).map(String).filter(Boolean))];
      const issueId = sourceIds.length === 1 ? sourceIds[0] : `plan-action:${plan._id}:${key}:${index}`;
      rows.push({ issueId, sourceTitle: String(action.items || action.name || action.purpose || action.department || action.focus || (key === 'annual_checkup' ? '年度体检' : '管理事项')).slice(0, 240),
        goal: String(action.goal || fallbackGoal).slice(0, 240), focus: String(action.reason || action.basisSummary || action.focus || fallbackGoal).slice(0, 500),
        goalDimension: '', baseline: '' });
    }
  }
  return [...new Map(rows.map(row => [row.issueId, row])).values()].slice(0, 32);
}

module.exports = { DEFAULTS, fromPlan };
