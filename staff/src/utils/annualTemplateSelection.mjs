const legacy = new Set(['young_state', 'health_reshape', 'chronic_stable', 'health_prevention'])
export function matchingAnnualTemplate(type, templates) {
  const matches = templates.filter(t => t.content?.servicePlanCode === type || (legacy.has(type) && t.content?.strategyType === type))
  return matches.length === 1 ? matches[0] : null
}
export function annualTemplateCode(type, template) {
  const code = template?.content?.servicePlanCode
  if (!code || (type !== code && !(legacy.has(type) && template.content.strategyType === type))) {
    throw new Error('当前方案与所选模板不匹配，请明确选择对应的服务版本')
  }
  return code
}
