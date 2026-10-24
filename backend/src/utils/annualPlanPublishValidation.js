function validate(data = {}, today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10)) {
  const modules = Object.values(data || {}).filter(m => m && m.enabled !== false);
  const rows = modules.flatMap(m => Array.isArray(m.records) ? m.records : [m]);
  if (rows.some(r => r.serviceMode && !['reminder','single','managed','shared'].includes(r.serviceMode))) return '服务落地方式无效';
  if (rows.some(r => r.serviceMode === 'shared' && !Object.entries(require('./annualVisitGroups').MODULE_DATES).some(([key]) => data[key]?.records?.includes(r)))) return '该事项不支持随同就诊';
  if (rows.some(r => r.serviceMode === 'single' && !r.serviceType)) return '推送前请补全单项服务类型；当前可暂存草稿';
  const visitGroupError = require('./annualVisitGroups').validateVisitGroups(data);
  if (visitGroupError) return visitGroupError;
  const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d && d >= today;
  const datedModules = [
    ['medical_treatment', 'visit_time', '就医安排'], ['specialist_collab', 'plan_time', '联合会诊'],
    ['checkup_completion', 'time', '完善检查'], ['abnormal_followup', 'time', '定期复查'],
    ['vaccine', 'time', '疫苗接种'], ['functional_medicine', 'time', '功能医学检测'],
  ];
  for (const [key, field, label] of datedModules) {
    const records = data?.[key]?.enabled === false ? [] : data?.[key]?.records || [];
    if (records.some(row => !validDate(row[field]))) return `推送前请补全${label}的执行日期（不早于今天）`;
  }
  const annualCheckup = data?.annual_checkup;
  if (annualCheckup?.enabled !== false && annualCheckup && (annualCheckup.focus || annualCheckup.standardPlanId || annualCheckup.date) && !validDate(annualCheckup.date)) return '推送前请补全年度体检日期（不早于今天）';
  const personalized = data?.personalized_followups?.enabled === false ? [] : data?.personalized_followups?.records || [];
  if (personalized.some(r => !validDate(r.executionDate))) return '推送前请补全每项随访日期（不早于今天）；由客户所属健管专员跟进，当前可暂存草稿';
  return '';
}
module.exports = { validate };
