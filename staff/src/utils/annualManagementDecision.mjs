export function annualManagementSourceKey(source) {
  if (source?.kind === 'symptom') return `symptom:${source.recordId}`
  const itemId = ['screening', 'report_item'].includes(source?.kind) ? String(source.itemId || source.itemName || '').trim() : ''
  return `${source?.kind}:${source?.reportId}${itemId ? `:${itemId}` : ''}`
}

export function findAnnualManagementDecision(decisions = [], source) {
  // 一份报告可能同时包含多个项目，报告总论也可能在各项目中重复。
  // 只认项目级来源键，不根据报告 ID 或结论文字推断其他项目的纳入状态。
  return decisions.find(item => item.sourceKey === annualManagementSourceKey(source)) || null
}

export function labManagementSource(record, item) {
  return { kind: 'screening', reportId: item.reportId || record._id, itemId: item.itemId, itemName: item.name }
}

export function labManagementSummary(record, decisions) {
  const selected = new Set()
  for (const item of record.reportItems) {
    const source = labManagementSource(record, item)
    if (findAnnualManagementDecision(decisions, source)) selected.add(annualManagementSourceKey(source))
  }
  const groups = (record._sourceItems || []).filter(item => item.itemId)
    .map(item => ({ kind: 'screening', reportId: item.reportId, itemId: item.itemId }))
  const reportId = record._sourceItems?.[0]?.reportId || record._id
  groups.push({ kind: 'screening_report', reportId })
  const legacy = groups.filter(source => !selected.has(annualManagementSourceKey(source)) && findAnnualManagementDecision(decisions, source))
  return { count: selected.size, legacy }
}
