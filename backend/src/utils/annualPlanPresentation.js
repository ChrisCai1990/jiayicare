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

function normalizeItem(moduleKey, record, index) {
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
  const title = first(record.items, record.name, record.standardPlanName, record.purpose, record.focus, MODULE_NAME[moduleKey]);
  const schedule = first(record.visit_time, record.plan_time, record.executionDate, record.date, record.time);
  return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey] || moduleKey, title,
    problem: first(record.reason, record.current, record.finding),
    evidence: first(record.basisSummary, record.matchReason, record.sourceRule),
    goal: moduleKey === 'nutrition_assessment'
      ? (record.nutritionComparisonMetrics?.filter(name => !isInternalNutritionMetric(name)).length ? `前后对比：${record.nutritionComparisonMetrics.filter(name => !isInternalNutritionMetric(name)).join('、')}` : '核实膳食与体成分情况')
      : first(record.goal, record.purpose, record.focus, record.personalization),
    completionStandard: record.completionStandard || '',
    interventionPlan: first(record.personalizedAdvice, record.personalization, record.standardContent, record.plan),
    reviewItems: Array.isArray(record.reviewItems) ? record.reviewItems : [],
    schedule, frequency: record.frequency || '',
    careTarget: { hospital: record.hospital || record.institution || '', department: record.department || record.order_dept || '', expert: record.expert || record.order_expert || '' },
    customerAction: record.customerAction || '', precautions: record.precautions || '',
    service: { mode: record.serviceMode || 'reminder', modeLabel: SERVICE_MODE[record.serviceMode || 'reminder'], type: record.serviceType || '', typeLabel: SERVICE_TYPE[record.serviceType] || '' },
    reviewStatus: record.reviewStatus || '',
  };
}

function buildAnnualPlanDisplayItems(moduleData = {}) {
  const items = [];
  Object.entries(moduleData).forEach(([moduleKey, module]) => {
    if (!module || module.enabled === false) return;
    const records = moduleKey === 'nutrition_assessment' && Array.isArray(module.records)
      ? [{...module, records: undefined}, ...module.records]
      : Array.isArray(module) ? module : Array.isArray(module.records) ? module.records : [module];
    records.forEach((record, index) => { if (record && Object.keys(record).length && !(moduleKey === 'personalized_followups' && internalDaily(record))) items.push(normalizeItem(moduleKey, record, index)); });
  });
  return items;
}

const internalFields = new Set(['logisticsSourceReportId', 'metricsManuallyAdjusted', 'advisorTargetsManuallyAdjusted', 'executorId', 'sourceIssueId', 'sourceStatus', 'internalOnly', 'notes', 'timingReason', 'timingBaseDate', 'timingIntervalMonths', 'timingSourceId', 'dateSelectionReason', 'scheduleSeparationReason', 'futureRepeatReason', 'futureRepeatSourceId', 'sourceReviewId', 'sourceTitle', 'sourceConfirmedAt', 'sourceIndex', 'sourceGoal', 'sourceFocus', 'nutritionRelevant', 'rehabRelevant', 'actionTiming', 'effectiveAt', 'goalMetric', 'symptomTerm', 'lifestyleType']);
// Legacy clients render raw moduleData, so hiding fields only in displayItems is insufficient.
function customerModuleData(value) {
  if (Array.isArray(value)) return value.filter(item => !internalDaily(item)).map(customerModuleData);
  if (!value || typeof value !== 'object' || value.constructor !== Object) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key, child]) => !internalFields.has(key) && !(key === 'nutrition_assessment' && child?.enabled === false))
    .map(([key, child]) => [key, key === 'management_targets'
      ? { ...customerModuleData(child), records: (child?.records || []).filter(row => !isInternalNutritionMetric(`${row.goal || ''} ${row.focus || ''}`)).map(customerModuleData) }
      : key === 'nutrition_assessment'
      ? { ...customerModuleData(child),
          nutritionComparisonMetrics: (child?.nutritionComparisonMetrics || []).filter(name => !isInternalNutritionMetric(name)),
          advisorTargets: (child?.advisorTargets || []).filter(row => !isInternalNutritionMetric(row.metric) && row.internalOnly !== true).map(row => ({ kind: row.kind, metric: row.metric, baseline: row.baseline, target: row.target })) }
      : key === 'health_consensus'
      ? { enabled: child?.enabled !== false, records: (child?.records || []).map(row => ({ question: row.question || '', method: row.method || '', frequency: row.frequency || '', firstDate: row.firstDate || '' })) }
      : customerModuleData(child)]));
}
module.exports = { buildAnnualPlanDisplayItems, normalizeItem, customerModuleData, internalDaily };
