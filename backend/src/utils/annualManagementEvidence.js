async function load(patientId, year, dependencies = {}) {
  const Decision = dependencies.Decision || require('../models/AnnualManagementDecision');
  const Report = dependencies.Report || require('../models/MedicalReport');
  const decisions = await Decision.find({ patientId, year }).sort({ reviewedAt: 1 }).lean();
  const evidence = [], stale = [];
  for (const decision of decisions) {
    const report = await Report.findOne({ _id: decision.reportId, user: patientId, audit_status: 'audited' })
      .select('_id title checkDate updatedAt reportItems').lean();
    const changed = !report || String(report.updatedAt) !== String(decision.sourceSnapshot?.reportUpdatedAt);
    if (changed) { stale.push(decision.title); continue; }
    evidence.push({ id: `management_issue:${decision._id}`, content: {
      reportId: report._id, reportTitle: report.title, checkDate: report.checkDate,
      problem: decision.title, direction: decision.direction, advisorNote: decision.note,
      source: decision.sourceSnapshot?.item || null, reviewedAt: decision.reviewedAt,
    } });
  }
  return { evidence, stale };
}

const DIRECTION_LABELS = {
  medical_treatment: '安排就医', checkup_completion: '完善检查', abnormal_followup: '定期复查',
  vaccine: '疫苗接种', monitoring: '日常监测', ongoing_management: '持续管理或观察',
};
function managementTargets(evidence = []) {
  return evidence.slice(0, 32).map(item => {
    const { problem, direction, reportTitle, advisorNote } = item.content;
    const directionLabel = DIRECTION_LABELS[direction] || '持续管理';
    return { issueId: item.id, goal: `${problem}：按${directionLabel}安排完成本年度可核对的管理行动`,
      focus: [reportTitle && `依据已审核${reportTitle}`, advisorNote || `核对${problem}的执行结果与后续需要`].filter(Boolean).join('；'),
      nutritionRelevant: false, sourceTitle: reportTitle || '已审核专项筛查', sourceGoal: directionLabel };
  });
}

function validatePlanCoverage(moduleData = {}, evidence = []) {
  for (const source of evidence) {
    const key = source.content.direction === 'ongoing_management' ? 'personalized_followups' : source.content.direction;
    const module = moduleData[key];
    const rows = module?.enabled === false ? [] : Array.isArray(module?.records) ? module.records : module ? [module] : [];
    if (!rows.some(row => Array.isArray(row.sourceIds) && row.sourceIds.includes(source.id))) {
      return `“${source.content.problem}”尚未按顾问选定的管理方向进入方案，请重新生成或补齐对应事项`;
    }
  }
  return '';
}

module.exports = { load, managementTargets, validatePlanCoverage };
