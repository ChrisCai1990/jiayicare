function validate(data = {}, today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10)) {
  data = require('./annualPlanDates').normalize(data);
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
    const index = records.findIndex(row => !validDate(row[field]));
    if (index >= 0) {
      const row = records[index];
      const title = row.reviewItems?.join('、') || row.items || row.reason || row.name || `第${index + 1}项`;
      return `${label}“${title}”：执行日期${row[field] ? `为${row[field]}` : '未填写'}，请填写有效日期且不早于${today}；当前可保存草稿`;
    }
  }
  const annualCheckup = data?.annual_checkup;
  if (annualCheckup?.enabled !== false && annualCheckup && (annualCheckup.enabled === true || annualCheckup.focus || annualCheckup.standardPlanId || annualCheckup.date)) {
    if (!validDate(annualCheckup.date)) return '推送前请补全下一年度体检日期（不早于今天）';
    if (Number.isInteger(annualCheckup.targetYear) && annualCheckup.date.slice(0, 4) !== String(annualCheckup.targetYear)) return `下一年度体检日期请选择${annualCheckup.targetYear}年`;
    if (!String(annualCheckup.institution || '').trim()) return '推送前请填写下一年度体检机构';
    if (!String(annualCheckup.focus || '').trim()) return '推送前请核对下一年度体检重点关注项目；无依据时请移除本项';
    if (annualCheckup.serviceMode === 'managed' && annualCheckup.managedServiceType !== 'checkup') return '下一年度体检请选择体检一站式服务';
  }
  const personalized = data?.personalized_followups?.enabled === false ? [] : data?.personalized_followups?.records || [];
  if (personalized.some(r => !validDate(r.executionDate))) return '推送前请补全每项随访日期（不早于今天）；由客户所属健管专员跟进，当前可暂存草稿';
  const consensus = data?.health_consensus?.enabled === false ? [] : data?.health_consensus?.records || [];
  const issueIds = new Set((data?.management_targets?.records || []).map(row => String(row.issueId || '')).filter(Boolean));
  if (consensus.some(row => !String(row.question || '').trim() || !String(row.method || '').trim() || !String(row.frequency || '').trim() || !validDate(row.firstDate))) return '推送前请补全健康认知与共识的待澄清问题、沟通方式、频率和首次日期';
  if (consensus.some(row => [row.currentUnderstanding, row.concern, row.question, row.method, row.frequency].some(value => String(value || '').length > 1000))) return '健康认知与共识每项内容不得超过 1000 字';
  if (consensus.some(row => (row.sourceIds || []).some(id => !issueIds.has(String(id))))) return '健康认知与共识关联的管理问题已变化，请重新选择';
  return '';
}
module.exports = { validate };
