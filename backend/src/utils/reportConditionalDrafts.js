const HealthPlan = require('../models/HealthPlan');
async function draftConditionalModulesFromAuditedReport(report, explicitAbnormalItems = []) {
  const reportText = [report.title, report.examConclusion, report.note, ...(report.reportItems || []).flatMap(item => [item.name, item.conclusion, item.diagnosis, item.findings])]
    .filter(Boolean).join('\n');
  const abnormalNames = [
    ...(explicitAbnormalItems || []).map(item => typeof item === 'string' ? item : (item.name || item.itemName || '')),
    ...(report.reportItems || []).filter(item => ['abnormal', 'attention'].includes(item.status)).map(item => item.name),
  ].filter(Boolean);
  const linkedFilter = report.sourceHealthPlanId || report.planId
    ? { _id: report.sourceHealthPlanId || report.planId, patientId: report.user }
    : { patientId: report.user, status: 'active', type: 'medical_assist' };
  const plans = await HealthPlan.find(linkedFilter);
  const conditionalPlans = plans.filter(plan => (plan.content?.workflowModules || plan.content?.followUpPlans || []).some(item => item.mode === 'conditional'));
  if (!conditionalPlans.length) return { drafted: 0, hasConditionalModules: false };
  return require('./conditionalReportClaim').withConditionalReportClaim(report, conditionalPlans.map(plan => plan._id), async (claim) => {
  let drafted = 0, hasConditionalModules = false;
  for (const plan of plans) {
    const c = plan.content || {};
    const originalContent = plan.toObject().content;
    const modules = (c.workflowModules || c.followUpPlans || []).filter(item => item.mode === 'conditional');
    if (!modules.length) continue;
    hasConditionalModules = true;
    const previous = Array.isArray(c.workflowModuleDecisions) ? c.workflowModuleDecisions : [];
    let changed = false;
    for (const module of modules) {
      const id = String(module.id || module._id || '');
      const old = previous.find(item => String(item.id || item._id) === id);
      if (old && ['needed', 'not_needed'].includes(old.decision)) continue;
      let aiSuggestion = 'uncertain';
      let evidence = '当前已审核资料未提供足够依据，需人工确认。';
      if (module.trigger === 'abnormal_found' && abnormalNames.length) {
        aiSuggestion = 'needed'; evidence = `报告异常/需关注项目：${[...new Set(abnormalNames)].slice(0, 12).join('、')}`;
      } else if (module.trigger === 'followup_instruction_found' && /复诊|随诊|复查|再次就诊/.test(reportText)) {
        aiSuggestion = 'needed'; evidence = `已审核资料出现复诊/复查医嘱：${reportText.match(/[^。；\n]{0,40}(?:复诊|随诊|复查|再次就诊)[^。；\n]{0,60}/)?.[0] || '请查看报告结论'}`;
      } else if (module.trigger === 'exam_order_found' && /检查单|检验单|完善.{0,20}(?:检查|检验)|建议.{0,20}(?:检查|检验)/.test(reportText)) {
        aiSuggestion = 'needed'; evidence = `已审核资料出现检查安排：${reportText.match(/[^。；\n]{0,40}(?:检查单|检验单|完善|建议)[^。；\n]{0,60}/)?.[0] || '请查看报告结论'}`;
      }
      const record = { ...module, id, decision: 'pending', aiSuggestion, evidence, aiDraftedAt: new Date(), decidedAt: null, decidedBy: null, reviewerRole: module.trigger === 'exam_order_found' ? 'healthPlanner' : 'familyDoctor' };
      const index = previous.findIndex(item => String(item.id || item._id) === id);
      if (index >= 0) previous[index] = record; else previous.push(record);
      changed = true; drafted += 1;
    }
    if (changed) {
      await require('./conditionalDraftWrite').saveConditionalDrafts(HealthPlan, plan, originalContent, previous, claim);
    }
  }
  return { drafted, hasConditionalModules };
  });
}
module.exports = { draftConditionalModulesFromAuditedReport };
