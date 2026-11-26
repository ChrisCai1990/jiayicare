const MODULE_NAME = {
  medical_treatment: '需要安排就医', specialist_collab: '全专联合会诊', checkup_completion: '需要完善体检',
  abnormal_followup: '需要定期复查', vaccine: '疫苗接种', monitoring: '家庭健康监测', lifestyle: '生活方式干预',
  medication: '用药管理', supplement: '营养素管理', nutrition_intervention: '营养干预', nutrition_assessment: '营养评估',
  annual_checkup: '年度体检', functional_medicine: '功能医学检测', quarterly_eval: '阶段评估', personalized_followups: '个性化管理', management_targets: '年度管理目标', health_consensus: '健康认知与共识',
};
const SERVICE_MODE = { reminder: '仅提醒', single: '单项服务', managed: '全托管' };
const SERVICE_TYPE = { proxy_booking: '代约/代办', proxy_visit: '代诊', escort_visit: '陪诊', escort_exam: '陪检', consult_coordination: '会诊协调' };
const { isInternalNutritionMetric } = require('../../../shared/annualNutritionAdvisorTargets.cjs');
const first = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim()) || '';
const internalDaily = record => /^【?日常跟进(?:与动态调整)?】?$/.test(String(record?.standardPlanName || record?.items || '').trim());

function expertNames(snapshots, entered) {
  return [...new Set([...(Array.isArray(snapshots) ? snapshots.map(person => person?.name) : []), entered].filter(Boolean))];
}

function normalizeItem(moduleKey, record, index) {
  if (moduleKey === 'annual_checkup') return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey], title: MODULE_NAME[moduleKey],
    schedule: record.date || '',
    focus: record.focus || '',
    customerAction: record.focus ? `在下一年度体检中重点关注：${String(record.focus).split(/\r?\n/).map(row => row.trim()).filter(Boolean).join('、')}` : '',
    careTarget: { hospital: record.institution || '', department: '', expert: '' },
    service: { mode: record.serviceMode || 'reminder', modeLabel: ({ reminder: '仅提醒', single: '方案定制＋机构安排', managed: '体检一站式服务' })[record.serviceMode || 'reminder'],
      type: record.serviceType || '', typeLabel: SERVICE_TYPE[record.serviceType] || '' },
  };
  if (moduleKey === 'health_consensus') return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey], title: record.question || `沟通问题 ${index + 1}`,
    goal: record.question || '', interventionPlan: record.method || '', schedule: record.firstDate || '', frequency: record.frequency || '',
  };
  if (moduleKey === 'management_targets') return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey], title: record.goal || `管理目标 ${index + 1}`,
    goal: record.goal || '', interventionFocus: record.focus || '',
    schedule: record.actionTiming?.firstDueDate || '',
    frequency: record.actionTiming?.mode === 'rolling' ? record.actionTiming.frequency || '本轮完成后再确定下一轮' : '',
  };
  if (moduleKey === 'monitoring') return {
    id: `${moduleKey}:${index}`, moduleKey, category: '日常监测', title: record.items || `监测项目 ${index + 1}`,
    measurementPeriod: record.measurementPeriod || record.time || '', frequency: record.frequency || '',
    precautions: record.precautions || '',
  };
  const examExperts = expertNames(record.expertSnapshots, record.expert);
  const orderExperts = expertNames(record.orderExpertSnapshots, record.order_expert);
  const rawTitle = first(record.items, record.name, record.standardPlanName, record.purpose, record.focus, MODULE_NAME[moduleKey]);
  const title = moduleKey === 'medical_treatment' && /^(需要安排就医|安排就医)$/.test(rawTitle) && record.department
    ? `前往${record.department}就诊` : rawTitle;
  const schedule = first(record.visit_time, record.plan_time, record.executionDate, record.date, record.time);
  const rawGoal = moduleKey === 'nutrition_assessment'
    ? (record.nutritionComparisonMetrics?.filter(name => !isInternalNutritionMetric(name)).length ? `前后对比：${record.nutritionComparisonMetrics.filter(name => !isInternalNutritionMetric(name)).join('、')}` : '核实膳食与体成分情况')
    : first(record.goal, record.purpose, record.focus, record.personalization);
  const goal = /^(管控|管理|评估)$/.test(String(rawGoal).trim()) ? ({
    medical_treatment: '请专科医生评估并明确后续诊治安排',
    abnormal_followup: '核对复查结果并确定下一步处理',
    checkup_completion: '完成检查并核对结果',
  }[moduleKey] || '完成本项安排后确认下一步') : rawGoal;
  return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey] || moduleKey, title,
    problem: first(record.reason, record.current, record.finding),
    evidence: first(record.basisSummary, record.matchReason, record.sourceRule),
    goal,
    completionStandard: record.completionStandard || '',
    interventionPlan: first(record.personalizedAdvice, record.personalization, record.standardContent, record.plan),
    reviewItems: Array.isArray(record.reviewItems) ? record.reviewItems : [],
    schedule, frequency: record.frequency || '',
    careTarget: { hospital: record.hospital || record.institution || '',
      department: moduleKey === 'abnormal_followup' && record.reviewGroupVersion === 1
        ? record.order_dept || record.department || '' : record.department || record.order_dept || '',
      expert: moduleKey === 'abnormal_followup' && record.reviewGroupVersion === 1
        ? orderExperts.join('、') || examExperts.join('、') : examExperts.join('、') || orderExperts.join('、') },
    ...(['checkup_completion', 'abnormal_followup', 'functional_medicine'].includes(moduleKey) ? {
      examArrangement: { orderDepartment: record.order_dept, examDepartment: record.department,
        orderExperts,
        examExperts },
    } : {}),
    customerAction: record.customerAction || ({ medical_treatment: '按约定时间就诊，完成后将医生意见交给健康顾问',
      abnormal_followup: '按计划完成复查，并将结果交给健康顾问',
      checkup_completion: '完成检查后将结果交给健康顾问' }[moduleKey] || ''), precautions: record.precautions || '',
    service: { mode: record.serviceMode || 'reminder', modeLabel: SERVICE_MODE[record.serviceMode || 'reminder'], type: record.serviceType || '', typeLabel: SERVICE_TYPE[record.serviceType] || '' },
    reviewStatus: record.reviewStatus || '',
  };
}

function buildAnnualPlanDisplayItems(moduleData = {}) {
  const items = [];
  Object.entries(moduleData).forEach(([moduleKey, module]) => {
    // 营养师的评估重点及标准随访模板在各自执行流程中呈现，不作为客户年度方案事项。
    if (moduleKey === 'nutrition_assessment' || moduleKey === 'personalized_followups' || (moduleKey === 'health_consensus' && !module?.shareWithCustomer)) return;
    if (!module || module.enabled === false) return;
    const records = moduleKey === 'nutrition_assessment' && Array.isArray(module.records) && module.records.length
      ? module.records
      : Array.isArray(module) ? module : Array.isArray(module.records) ? module.records : [module];
    if (moduleKey === 'monitoring') {
      const monitoringItems = records.filter(row => row?.items).map((row, index) => ({
        id: `monitoring:${index}`, title: row.items, measurementPeriod: row.measurementPeriod || row.time || '',
        frequency: row.frequency || '', precautions: row.precautions || '',
      }));
      if (monitoringItems.length) items.push({ id: 'monitoring', moduleKey, category: '日常监测', title: '项目与周期',
        monitoringItems, customerAction: monitoringItems.map(row =>
          `${row.title}：${[row.measurementPeriod, row.frequency].filter(Boolean).join(' · ')}`).join('\n'),
        service: { mode: 'monitoring', modeLabel: '按方案监测' } });
      return;
    }
    records.forEach((record, index) => { if (record && Object.keys(record).length && !(moduleKey === 'personalized_followups' && internalDaily(record))) items.push(normalizeItem(moduleKey, record, index)); });
  });
  const grouped = new Map();
  for (const [groupId, entries] of require('./annualVisitGroups').visitGroups(moduleData)) {
    if (entries.length < 2 || !entries.every(entry => entry.row.visitMergeConfirmed)) continue;
    const ids = new Set(entries.map(entry => `${entry.moduleKey}:${entry.index}`));
    const members = items.filter(item => ids.has(item.id));
    if (members.length < 2) continue;
    const lead = members.find(item => ['single', 'managed'].includes(item.service?.mode)) || members[0];
    const names = members.map(item => item.reviewItems?.join('、') || item.title);
    const combined = { ...lead, id: `visit:${groupId}`, title: `同次就诊 · ${names.join('、')}`, visitItems: members,
      customerAction: members.map((item, i) => [names[i], item.examArrangement?.orderDepartment,
        item.examArrangement?.examDepartment || item.careTarget?.department, item.examArrangement ? [...item.examArrangement.orderExperts, ...item.examArrangement.examExperts].join('、') : item.careTarget?.expert, item.customerAction].filter(Boolean).join(' · ')).join('\n') };
    members.forEach((item, index) => grouped.set(item.id, index === 0 ? combined : null));
  }
  return items.map(item => grouped.has(item.id) ? grouped.get(item.id) : item).filter(Boolean);
}

const internalFields = new Set(['excludedReviewKeys', 'clientAppUsage', 'firstManualFollowUpDate', 'metricType', 'screeningDraft', 'sourceIds', 'advisorExcluded', 'visitResultFollowUp', 'logisticsSourceReportId', 'metricsManuallyAdjusted', 'advisorTargetsManuallyAdjusted', 'executorId', 'sourceIssueId', 'sourceStatus', 'internalOnly', 'notes', 'timingReason', 'timingBaseDate', 'timingIntervalMonths', 'timingSourceId', 'dateSelectionReason', 'scheduleSeparationReason', 'futureRepeatReason', 'futureRepeatSourceId', 'sourceReviewId', 'sourceTitle', 'sourceConfirmedAt', 'sourceIndex', 'sourceGoal', 'sourceGoals', 'sourceFocus', 'nutritionRelevant', 'rehabRelevant', 'actionTiming', 'directionTimings', 'screeningSuggestedDate', 'effectiveAt', 'goalMetric', 'symptomTerm', 'lifestyleType', 'basisSummary', 'matchReason', 'sourceRule', 'reason', 'current', 'finding', 'personalizedAdvice']);
// Legacy clients render raw moduleData, so hiding fields only in displayItems is insufficient.
function customerModuleData(value) {
  if (Array.isArray(value)) return value.filter(item => !internalDaily(item)).map(customerModuleData);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !internalFields.has(key) && key !== 'nutrition_assessment' && key !== 'personalized_followups' && (key !== 'health_consensus' || value[key]?.shareWithCustomer === true))
    .map(([key, child]) => [key, key === 'management_targets'
      ? { ...customerModuleData(child), records: (child?.records || []).filter(row => !isInternalNutritionMetric(`${row.goal || ''} ${row.focus || ''}`)).map(customerModuleData) }
      : key === 'annual_checkup'
      ? { enabled: child?.enabled !== false, date: child?.date || '', institution: child?.institution || '',
          focus: /内部|来源[:：]|missing:/i.test(String(child?.focus || '')) ? '' : child?.focus || '',
          serviceMode: child?.serviceMode || 'reminder', serviceType: child?.serviceType || '' }
      : key === 'health_consensus'
      ? { enabled: child?.enabled !== false, shareWithCustomer: true, records: (child?.records || []).map(row => ({ question: row.question || '', method: row.method || '', frequency: row.frequency || '', firstDate: row.firstDate || '' })) }
      : customerModuleData(child)]));
}
module.exports = { buildAnnualPlanDisplayItems, normalizeItem, customerModuleData, internalDaily };
