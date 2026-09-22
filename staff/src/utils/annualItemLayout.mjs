export const simpleAnnualModules = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'annual_checkup']
export function annualItemLayout(key, def, managerName) {
  if (!simpleAnnualModules.includes(key)) return def
  const hidden = new Set(['standardPlanName', 'standardContent', 'standardSchedule', 'coordinator', 'followUpStaff', 'frequency', 'ownerRole', 'serviceMode', 'serviceType'])
  return { ...def, annualServiceArrangement: true, managerName: managerName || '未分配健管专员，请先完善客户归属',
    fields: def.fields.filter(f => !hidden.has(f.key)).flatMap(f => ['visit_time', 'time', 'date'].includes(f.key) ? [{ ...f, label: '建议就医/检查日期', appointmentDate: true }, { key: 'timingReason', label: '时间评估依据（顾问审核）', type: 'textarea' }] : [f]),
    serviceFields: def.fields.filter(f => ['serviceMode', 'serviceType'].includes(f.key)),
  }
}
