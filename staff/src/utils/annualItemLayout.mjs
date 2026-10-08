export const simpleAnnualModules = ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'annual_checkup']
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
  const hidden = new Set(['standardPlanName', 'standardContent', 'standardSchedule', 'coordinator', 'followUpStaff', 'frequency', 'ownerRole', 'serviceMode', 'serviceType'])
  return { ...def, reviewDriven: true, annualServiceArrangement: true, managerName: managerName || '未分配健管专员，请先完善客户归属',
    fields: def.fields.filter(f => !hidden.has(f.key)).flatMap(f => ['visit_time', 'time', 'date'].includes(f.key) ? [{ ...f, label: '建议就医/检查日期', appointmentDate: true }, { key: 'timingReason', label: '时间评估依据', type: 'textarea', internal: true }] : [f]),
    serviceFields: [
      ...def.fields.filter(f => ['serviceMode', 'serviceType'].includes(f.key)).map(f => f.key === 'serviceMode' && ['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(key)
        ? { ...f, options: [...f.options, { value: 'shared', label: '随同本次就诊（不重复派单）' }] } : f),
      ...(['medical_treatment', 'checkup_completion', 'abnormal_followup'].includes(key)
        ? [{ key: 'visitGroupId', label: '同次就诊名称', type: 'text', placeholder: '相关事项填写相同名称，如：11月浙二消化内科' }] : []),
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
