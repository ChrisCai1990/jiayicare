export function mergeManagementTargetEdits(incoming, existing = []) {
  const byIssue = new Map(existing.filter(row => row.issueId).map(row => [row.issueId, row]))
  const editable = ['goal', 'focus', 'goalDimension', 'baseline', 'goalMetric', 'symptomTerm', 'lifestyleType', 'nutritionRelevant', 'rehabRelevant']
  return incoming.map(row => {
    const old = byIssue.get(row.issueId)
    if (!old) return row
    const kept = {}
    for (const key of editable) if (Object.hasOwn(old, key)) kept[key] = old[key]
    return { ...row, ...kept, ...(row.sourceGoals?.includes('营养评估') || row.sourceGoal === '营养评估' ? { nutritionRelevant: true } : {}) }
  })
}

export function carryAnnualTargets(modules = {}, confirmed = [], draftActions = []) {
  if (!confirmed.length) return { modules, changed: false }
  const existing = modules.management_targets?.records || []
  const ids = new Set(confirmed.map(row => row.issueId))
  const records = [...mergeManagementTargetEdits(confirmed, existing), ...existing.filter(row => !ids.has(row.issueId))]
  const next = { ...modules, management_targets: { ...(modules.management_targets || {}), enabled: true, records } }
  const nutritionIssues = confirmed.filter(row => row.sourceGoals?.includes('营养评估') || row.sourceGoal === '营养评估')
  if (nutritionIssues.length) {
    const suggested = nutritionIssues.map(row => row.directionTimings?.nutrition_assessment?.firstDueDate)
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort()[0] || ''
    const existingNutrition = modules.nutrition_assessment || {}
    const dateFromSource = !existingNutrition.executionDate || existingNutrition.executionDate === existingNutrition.screeningSuggestedDate
    next.nutrition_assessment = { ...existingNutrition, enabled: true,
      ...(dateFromSource ? { executionDate: suggested, screeningSuggestedDate: suggested } : {}) }
  }
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine']) {
    const sourceDrafts = draftActions.filter(action => action.key === key).map(action => action.record)
    const activeDraftIds = new Set(sourceDrafts.flatMap(record => record?.sourceIds || []).map(String))
    const oldRows = modules[key]?.records || []
    const retained = oldRows.filter(row => !row.screeningDraft || (row.sourceIds || []).some(id => activeDraftIds.has(String(id))))
    const dateKey = key === 'medical_treatment' ? 'visit_time' : 'time'
    const hydrated = retained.map(row => {
      const source = sourceDrafts.find(record => (record.sourceIds || []).some(id => row.sourceIds?.includes(id)))
      let nextRow = row
      // Earlier review drafts placed the clinical ordering specialty in the exam department.
      if (key === 'abnormal_followup' && source?.reviewGroupVersion === 1 && source.order_dept
        && row.reviewGroupVersion === 1 && !row.order_dept) {
        nextRow = { ...row, order_dept: source.order_dept,
          ...(row.department === source.order_dept ? { department: '' } : {}) }
      }
      if (!source?.[dateKey] || nextRow[dateKey] || nextRow.appointmentSchedulingVersion
        || nextRow.datePending || nextRow.timingStatus === 'pending_confirmation') return nextRow
      return { ...nextRow, [dateKey]: source[dateKey], timingReason: nextRow.timingReason || source.timingReason || '',
        ...(source.appointmentSchedulingVersion === 1 ? { appointmentSchedulingVersion: 1 } : {}) }
    })
    const additions = sourceDrafts.filter(record =>
      !hydrated.some(row => (row.sourceIds || []).some(id => record.sourceIds?.includes(id))))
    if (JSON.stringify(hydrated) !== JSON.stringify(oldRows) || additions.length) next[key] = { ...(modules[key] || {}), enabled: true, records: [...hydrated, ...additions.map(record => ({ ...record, screeningDraft: true }))] }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(modules)
  return { modules: changed ? next : modules, changed }
}
