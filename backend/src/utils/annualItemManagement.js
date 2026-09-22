const MODULES = ['medical_treatment', 'checkup_completion', 'abnormal_followup'];
function normalizeAnnualItems(data, managerId) {
  const result = { ...data };
  for (const key of MODULES) {
    if (!Array.isArray(data?.[key]?.records)) continue;
    if (data[key].records.length && !managerId) throw Object.assign(new Error('请先为客户分配健管专员'), { statusCode: 400 });
    result[key] = { ...data[key], records: data[key].records.map(row => {
      const mode = row.serviceMode || 'reminder';
      if (mode === 'managed' && !['outpatient', 'checkup'].includes(row.managedServiceType)) throw Object.assign(new Error('请选择本项的门诊一站式或体检一站式服务'), { statusCode: 400 });
      return { ...row, frequency: '单次', coordinator: '', ownerRole: '健管专员', followUpStaff: String(managerId), serviceMode: mode,
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
