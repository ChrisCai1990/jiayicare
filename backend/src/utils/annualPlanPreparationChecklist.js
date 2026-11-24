const hasWaiver = (preparation, key) => (preparation?.waivers || []).some(item => item.key === key && String(item.reason || '').trim());

function buildAnnualPlanPreparationChecklist({ patient = {}, preparation = null, auditedReportCount = 0, continuity = null, recentCheckup = null }) {
  const items = [];
  const add = (key, label, complete, options = {}) => {
    const waived = !complete && options.waivable === true && hasWaiver(preparation, key);
    items.push({ key, label, complete: !!complete || waived, waived, blocking: options.blocking !== false, detail: options.detail || '', ...(options.reportId ? { reportId: options.reportId } : {}) });
  };

  add('onboarding', '基础健康档案已完成', patient.onboardingCompleted === true);
  add('family_doctor', '已分配健康顾问', !!patient.assignedFamilyDoctor);
  add('health_manager', '已分配健管专员', !!patient.assignedHealthManager);
  add('health_planner', '已分配健康规划师', !!patient.assignedHealthPlanner);
  add('audited_reports', '关键健康资料已审核', auditedReportCount > 0, { waivable: true, detail: auditedReportCount ? `已有${auditedReportCount}份已审核资料` : '暂无已审核资料' });
  add('complete_checkup', '完整体检报告已审核并全部解读', recentCheckup?.allowed === true,
    { detail: recentCheckup?.allowed ? `体检日期：${recentCheckup.latest?.date || ''}` : recentCheckup?.message || '请先完成体检报告审核及全部解读',
      reportId: recentCheckup?.pendingInterpretation?.[0] || recentCheckup?.problemReportId || recentCheckup?.latest?.reportId || '' });
  const isRenewal = continuity?.mode === 'renewal';
  // 专业评估和团队研判只为复杂事项提供补充依据，不是年度方案的必经步骤。
  // 专业评估可补充依据，完整体检及全部解读是年度方案的必经步骤。

  const blockingItems = items.filter(item => item.blocking && !item.complete);
  return {
    mode: isRenewal ? 'renewal' : 'initial',
    year: preparation?.year || null,
    latestCheckupDate: recentCheckup?.allowed ? recentCheckup.latest?.date || '' : '',
    ready: blockingItems.length === 0,
    items,
    blockingKeys: blockingItems.map(item => item.key),
    progress: { completed: items.filter(item => item.complete).length, total: items.length },
  };
}

module.exports = { buildAnnualPlanPreparationChecklist };
