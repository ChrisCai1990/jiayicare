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

export function carryAnnualTargets(modules = {}, confirmed = [], draftActions = []) {
  if (!confirmed.length) return { modules, changed: false }
  const existing = modules.management_targets?.records || []
  const ids = new Set(confirmed.map(row => row.issueId))
  const records = [...mergeManagementTargetEdits(confirmed, existing), ...existing.filter(row => !ids.has(row.issueId))]
  const next = { ...modules, management_targets: { ...(modules.management_targets || {}), enabled: true, records } }
  const nutritionIssues = confirmed.filter(row => row.sourceGoal === '营养评估')
  if (nutritionIssues.length) next.nutrition_assessment = { ...(modules.nutrition_assessment || {}), enabled: true }
  const activeNutritionIds = new Set(nutritionIssues.map(row => String(row.issueId)))
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine']) {
    const activeDraftIds = new Set(draftActions.filter(action => action.key === key).flatMap(action => action.record?.sourceIds || []).map(String))
    const oldRows = modules[key]?.records || []
    const retained = oldRows.filter(row => !row.screeningDraft || (row.sourceIds || []).some(id => activeDraftIds.has(String(id)) && !activeNutritionIds.has(String(id))))
    const additions = draftActions.filter(action => action.key === key).map(action => action.record).filter(record =>
      !retained.some(row => (row.sourceIds || []).some(id => record.sourceIds?.includes(id))))
    if (retained.length !== oldRows.length || additions.length) next[key] = { ...(modules[key] || {}), enabled: true, records: [...retained, ...additions.map(record => ({ ...record, screeningDraft: true }))] }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(modules)
  return { modules: changed ? next : modules, changed }
}
