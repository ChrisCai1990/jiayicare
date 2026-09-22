export const simpleAnnualModules = ['medical_treatment', 'checkup_completion', 'abnormal_followup']
export function annualItemLayout(key, def, managerName) {
  if (!simpleAnnualModules.includes(key)) return def
  const hidden = new Set(['standardPlanName', 'standardContent', 'standardSchedule', 'coordinator', 'followUpStaff', 'frequency', 'ownerRole', 'serviceMode', 'serviceType'])
  return { ...def, annualServiceArrangement: true, managerName: managerName || '未分配健管专员，请先完善客户归属',
    fields: def.fields.filter(f => !hidden.has(f.key)).map(f => ['visit_time', 'time'].includes(f.key) ? { ...f, label: '建议日期（非预约确认）' } : f),
    serviceFields: def.fields.filter(f => ['serviceMode', 'serviceType'].includes(f.key)),
  }
}
