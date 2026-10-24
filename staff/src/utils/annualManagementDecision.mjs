export function annualManagementSourceKey(source) {
  const itemId = source?.kind === 'screening' ? String(source.itemId || source.itemName || '').trim() : ''
  return `${source?.kind}:${source?.reportId}${itemId ? `:${itemId}` : ''}`
}

export function findAnnualManagementDecision(decisions = [], source) {
  // 一份报告可能同时包含多个项目，报告总论也可能在各项目中重复。
  // 只认项目级来源键，不根据报告 ID 或结论文字推断其他项目的纳入状态。
  return decisions.find(item => item.sourceKey === annualManagementSourceKey(source)) || null
}
