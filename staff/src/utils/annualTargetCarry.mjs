export function mergeManagementTargetEdits(incoming, existing = []) {
  const byIssue = new Map(existing.filter(row => row.issueId).map(row => [row.issueId, row]))
  const editable = ['goal', 'focus', 'goalDimension', 'baseline', 'goalMetric', 'symptomTerm', 'lifestyleType', 'nutritionRelevant', 'rehabRelevant']
  return incoming.map(row => {
    const old = byIssue.get(row.issueId)
    if (!old) return row
    const kept = {}
    for (const key of editable) if (Object.hasOwn(old, key)) kept[key] = old[key]
    return { ...row, ...kept, ...(row.sourceGoal === '营养评估' ? { nutritionRelevant: true } : {}) }
  })
}

export function carryAnnualTargets(modules = {}, confirmed = []) {
  if (!confirmed.length) return { modules, changed: false }
  const existing = modules.management_targets?.records || []
  const ids = new Set(confirmed.map(row => row.issueId))
  const records = [...mergeManagementTargetEdits(confirmed, existing), ...existing.filter(row => !ids.has(row.issueId))]
  const changed = JSON.stringify(records) !== JSON.stringify(existing)
  return { modules: changed ? { ...modules, management_targets: { ...(modules.management_targets || {}), enabled: true, records } } : modules, changed }
}
