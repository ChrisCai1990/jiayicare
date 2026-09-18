const hasWaiver = (preparation, key) => (preparation?.waivers || []).some(item => item.key === key && String(item.reason || '').trim());

function buildAnnualPlanPreparationChecklist({ patient = {}, preparation = null, auditedReportCount = 0, activeMedicationCount = 0, activeSupplementCount = 0, assessments = [] }) {
  const items = [];
  const add = (key, label, complete, options = {}) => {
    const waived = !complete && options.waivable === true && hasWaiver(preparation, key);
    items.push({ key, label, complete: !!complete || waived, waived, blocking: options.blocking !== false, detail: options.detail || '' });
  };

  add('onboarding', '基础健康档案已完成', patient.onboardingCompleted === true);
  add('family_doctor', '已分配健康顾问', !!patient.assignedFamilyDoctor);
  add('health_manager', '已分配健管专员', !!patient.assignedHealthManager);
  add('health_planner', '已分配健康规划师', !!patient.assignedHealthPlanner);
  add('audited_reports', '关键健康资料已审核', auditedReportCount > 0, { waivable: true, detail: auditedReportCount ? `已有${auditedReportCount}份已审核资料` : '暂无已审核资料' });
  add('medications', '当前用药已完善或确认无', preparation?.medicationStatus === 'none' || preparation?.medicationStatus === 'documented' || activeMedicationCount > 0);
  add('supplements', '当前营养素已完善或确认无', preparation?.supplementStatus === 'none' || preparation?.supplementStatus === 'documented' || activeSupplementCount > 0);

  const approvedAnnualDomains = new Set(assessments
    .filter(item => item.purpose === 'annual_input' && item.status === 'approved')
    .map(item => String(item.domain || '').trim()).filter(Boolean));
  const requiredDomains = [...new Set((preparation?.requiredAssessmentDomains || []).map(item => String(item).trim()).filter(Boolean))];
  add('assessment_scope', '已确定首次方案所需专业评估领域', requiredDomains.length > 0);
  requiredDomains.forEach(domain => add(`assessment:${domain}`, `${domain}专业健康评估已审核`, approvedAnnualDomains.has(domain)));
  add('advisor_ready', '健康顾问已确认资料足够生成方案', !!preparation?.advisorReadyConfirmedAt);

  const blockingItems = items.filter(item => item.blocking && !item.complete);
  return {
    year: preparation?.year || null,
    ready: blockingItems.length === 0,
    items,
    blockingKeys: blockingItems.map(item => item.key),
    progress: { completed: items.filter(item => item.complete).length, total: items.length },
  };
}

module.exports = { buildAnnualPlanPreparationChecklist };
