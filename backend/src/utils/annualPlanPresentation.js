const MODULE_NAME = {
  medical_treatment: '安排就医', specialist_collab: '全专联合会诊', checkup_completion: '完善检查',
  abnormal_followup: '定期复查', vaccine: '疫苗接种', monitoring: '家庭健康监测', lifestyle: '生活方式干预',
  medication: '用药管理', supplement: '营养素管理', nutrition_intervention: '营养干预',
  annual_checkup: '年度体检', functional_medicine: '功能医学检测', quarterly_eval: '阶段评估', personalized_followups: '个性化管理',
};
const SERVICE_MODE = { reminder: '仅提醒', single: '单项服务', managed: '全托管' };
const SERVICE_TYPE = { proxy_booking: '代约/代办', proxy_visit: '代诊', escort_visit: '陪诊', escort_exam: '陪检', consult_coordination: '会诊协调' };
const first = (...values) => values.find(value => value !== undefined && value !== null && String(value).trim()) || '';

function normalizeItem(moduleKey, record, index) {
  const title = first(record.items, record.name, record.standardPlanName, record.purpose, record.focus, MODULE_NAME[moduleKey]);
  const schedule = first(record.visit_time, record.plan_time, record.executionDate, record.date, record.time);
  return {
    id: `${moduleKey}:${index}`, moduleKey, category: MODULE_NAME[moduleKey] || moduleKey, title,
    problem: first(record.reason, record.current, record.finding),
    evidence: first(record.basisSummary, record.matchReason, record.sourceRule),
    goal: first(record.purpose, record.goal, record.focus, record.personalization),
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
    const records = Array.isArray(module) ? module : Array.isArray(module.records) ? module.records : [module];
    records.forEach((record, index) => { if (record && Object.keys(record).length) items.push(normalizeItem(moduleKey, record, index)); });
  });
  return items;
}

module.exports = { buildAnnualPlanDisplayItems, normalizeItem };
