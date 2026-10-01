const MODULES = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'personalized_followups'];
function normalizeAnnualItems(data, managerId, team = {}) {
  const result = { ...data };
  for (const key of MODULES) {
    if (data?.[key]?.enabled === false || !Array.isArray(data?.[key]?.records)) continue;
    result[key] = { ...data[key], records: data[key].records.map(row => {
      if (key === 'personalized_followups' && require('../../../shared/annualNutrition.cjs').isRow(row)) {
        if (!team.assignedNutritionist) throw Object.assign(new Error('请先为客户分配营养师'), {statusCode:400});
        return {...row,directNutritionAssessment:true,managementFollowUpVersion:2,followUpStaff:String(team.assignedNutritionist),ownerRole:'营养师',collaborator:'',collaborationDate:'',frequency:'单次',serviceMode:'reminder',serviceType:'',managedServiceType:''};
      }
      if (!managerId) throw Object.assign(new Error('请先为客户分配健管专员'), { statusCode: 400 });
      const mode = row.serviceMode || 'reminder';
      if (mode === 'managed' && !['outpatient', 'checkup'].includes(row.managedServiceType)) throw Object.assign(new Error('请选择本项的门诊一站式或体检一站式服务'), { statusCode: 400 });
      return { ...row, ...(key === 'personalized_followups' ? {managementFollowUpVersion:1,collaborator:'',collaborationDate:''} : {}), frequency: '单次', coordinator: '', ownerRole: '健管专员', followUpStaff: String(managerId), serviceMode: mode,
        serviceType: mode === 'single' ? row.serviceType : '', managedServiceType: mode === 'managed' ? row.managedServiceType : '' };
    }) };
  }
  if (data?.annual_checkup?.enabled !== false && data?.annual_checkup?.date) {
    const normalized = normalizeAnnualItems({ medical_treatment: { records: [data.annual_checkup] } }, managerId);
    result.annual_checkup = normalized.medical_treatment.records[0];
  }
  return result;
}
module.exports = { normalizeAnnualItems };
