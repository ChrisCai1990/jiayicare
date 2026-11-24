export const simpleAnnualModules = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'annual_checkup']
export function annualItemLayout(key, def, managerName, nutritionName, nutritionPlanId, planDirty) {
  if (key === 'personalized_followups') {
    const templateKeys = new Set(['standardPlanName', 'standardContent', 'standardSchedule'])
    const hidden = new Set([...templateKeys, 'followUpStaff', 'collaborator', 'collaborationDate', 'frequency', 'ownerRole', 'serviceMode', 'serviceType', 'basisSummary'])
    return { ...def, personalizedAssignment:true, nutritionPlanId, planDirty, nutritionName:nutritionName || '未分配营养师，请先完善客户归属', reviewDriven: true, annualServiceArrangement: true, managerName: managerName || '未分配健管专员，请先完善客户归属',
      serviceFields: def.fields.filter(f => ['serviceMode','serviceType'].includes(f.key)).map(f => f.key === 'serviceType' ? {...f, options:[...(f.options || []), {value:'nutrition_assessment',label:'营养评估服务'}]} : f),
      templateFields: def.fields.filter(f => templateKeys.has(f.key)),
      fields: def.fields.filter(f => !hidden.has(f.key)).map(f => f.key === 'personalization'
        ? { ...f, concretePlan: true, label: '具体方案', rows: 5, placeholder: '填写本客户具体要做的事、执行要求及跟进安排' }
        : f.key === 'matchReason' ? { ...f, label: '制定依据' } : f.key === 'executionDate' ? {...f,label:'随访日期'} : f),
    }
  }
  if (!simpleAnnualModules.includes(key)) return def
  if (key === 'annual_checkup') return {
    ...def, reviewDriven: true, annualServiceArrangement: true, annualCheckupScheduling: true,
    managerName: managerName || '未分配健管专员，请先完善客户归属',
    fields: [
      { key: 'date', label: '下一年度体检日期', type: 'date', appointmentDate: true },
      { key: 'institution', label: '体检机构', type: 'text', placeholder: '填写计划体检的机构' },
      { key: 'focus', label: '下一年度重点关注项目', type: 'textarea', placeholder: '每行一个已审核依据支持的体检项目；不要重复本年度待完善检查' },
      { key: 'timingReason', label: '时间安排依据', type: 'textarea', internal: true },
      { key: 'notes', label: '备注', type: 'textarea', internal: true },
    ],
    serviceFields: [{ key: 'serviceMode', label: '服务方式', type: 'select', defaultValue: 'reminder', options: [
      { value: 'reminder', label: '仅提醒' },
      { value: 'single', label: '方案定制＋机构安排' },
      { value: 'managed', label: '体检一站式服务' },
    ] }],
  }
  const hidden = new Set(['standardPlanName', 'standardContent', 'standardSchedule', 'coordinator', 'followUpStaff', 'frequency', 'ownerRole', 'serviceMode', 'serviceType'])
  if (key === 'vaccine') ['notes', 'precautions', 'customerAction'].forEach(field => hidden.add(field))
  const notesField = key === 'vaccine' ? null : def.fields.find(f => f.key === 'notes')
  const dateKeys = new Set(['visit_time', 'time', 'date'])
  const fields = def.fields.filter(f => !hidden.has(f.key) && f.key !== 'notes').flatMap(f => dateKeys.has(f.key)
    ? [{ ...f, label: key === 'vaccine' ? '接种时间' : '建议就医/检查日期', ...(key === 'vaccine' ? {} : { appointmentDate: true }) }, ...(key === 'vaccine' ? [] : [{ key: 'timingReason', label: '时间评估依据', type: 'textarea', internal: true }]),
      ...(notesField ? [{ ...notesField, label: '备注', placeholder: '填写本项安排需要补充说明的内容（选填）' }] : [])]
    : [f])
  if (notesField && !def.fields.some(f => dateKeys.has(f.key))) fields.push({ ...notesField, label: '备注', placeholder: '填写本项安排需要补充说明的内容（选填）' })
  return { ...def, reviewDriven: true, annualServiceArrangement: true, visitGrouping: ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(key), managerName: managerName || '未分配健管专员，请先完善客户归属',
    fields,
    serviceFields: [
      ...def.fields.filter(f => ['serviceMode', 'serviceType'].includes(f.key)).map(f => f.key === 'serviceMode' && ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(key)
        ? { ...f, options: [...(f.options || []), { value: 'shared', label: '随同本次就诊（不重复派单）' }] } : f),
    ],
  }
}

// Only remove explicit template metadata; retain clinical values and timing verbatim.
export function concretePlanText(value, templateName = '') {
  if (typeof value !== 'string') return value
  let text = value.replace(/[（(]\s*标准模板\s*ID\s*[:：]\s*[a-f0-9]{24}\s*[）)]/gi, '')
  const prefix = `启动${templateName}`
  if (templateName && text.startsWith(prefix) && /^[\s，,；;：:]/.test(text.slice(prefix.length))) {
    text = text.slice(prefix.length).replace(/^[\s，,；;：:]+/, '')
  }
  return text
}
