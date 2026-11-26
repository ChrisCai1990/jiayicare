import reviewExclusions from '../../../shared/annualReviewExclusion.cjs'
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

export function removeWithdrawnDraftSources(modules, withdrawnIssueIds = []) {
  if (!withdrawnIssueIds.length) return modules
  const withdrawn = new Set(withdrawnIssueIds)
  const next = { ...modules }
  for (const [key, data] of Object.entries(modules)) {
    if (!Array.isArray(data?.records)) continue
    const records = data.records.filter(row => key === 'management_targets'
      ? !withdrawn.has(row.issueId)
      : !(row.screeningDraft && row.sourceIds?.some(id => withdrawn.has(id))))
    if (records.length !== data.records.length) next[key] = { ...data, records }
  }
  return next
}

export function carryAnnualTargets(modules = {}, confirmed = [], draftActions = []) {
  if (!confirmed.length) return { modules, changed: false }
  const existing = modules.management_targets?.records || []
  const ids = new Set(confirmed.map(row => row.issueId))
  const records = [...mergeManagementTargetEdits(confirmed, existing), ...existing.filter(row =>
    !ids.has(row.issueId) && !String(row.issueId || '').startsWith('management_issue:ai_approved_'))]
  const next = { ...modules, management_targets: { ...(modules.management_targets || {}), enabled: true, records } }
  const nutritionIssues = confirmed.filter(row => row.sourceGoals?.includes('营养评估') || row.sourceGoal === '营养评估')
  if (nutritionIssues.length && modules.nutrition_assessment?.enabled !== false) {
    const suggested = nutritionIssues.map(row => row.directionTimings?.nutrition_assessment?.firstDueDate)
      .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')).sort()[0] || ''
    const existingNutrition = modules.nutrition_assessment || {}
    const dateFromSource = !existingNutrition.executionDate || existingNutrition.executionDate === existingNutrition.screeningSuggestedDate
    next.nutrition_assessment = { ...existingNutrition, enabled: true,
      ...(dateFromSource ? { executionDate: suggested, screeningSuggestedDate: suggested } : {}) }
  }
  const monitoringDrafts = draftActions.filter(action => action.key === 'monitoring').map(action => action.record)
  const oldMonitoring = modules.monitoring?.records || []
  const monitoringIds = new Set(monitoringDrafts.flatMap(row => row.sourceIds || []).map(String))
  const keptMonitoring = oldMonitoring.filter(row => !row.screeningDraft || (row.sourceIds || []).some(id => monitoringIds.has(String(id))))
    .filter(row => !row.screeningDraft || monitoringDrafts.some(draft => draft.metricType === row.metricType && draft.sourceIds?.some(id => row.sourceIds?.includes(id))))
  const monitoringRows = keptMonitoring.map(row => {
    if (!row.screeningDraft) return row
    const draft = monitoringDrafts.find(item => item.metricType === row.metricType && item.sourceIds?.some(id => row.sourceIds?.includes(id)))
    return draft ? { ...row, items: draft.items, measurementPeriod: draft.measurementPeriod,
      ...(draft.frequency !== undefined ? { frequency: draft.frequency } : {}) } : row
  })
  for (const draft of monitoringDrafts) if (!monitoringRows.some(row => row.metricType === draft.metricType && row.sourceIds?.some(id => draft.sourceIds?.includes(id)))) monitoringRows.push({ ...draft, screeningDraft: true })
  if (JSON.stringify(monitoringRows) !== JSON.stringify(oldMonitoring)) next.monitoring = { ...(modules.monitoring || {}), enabled: true, records: monitoringRows }
  for (const key of ['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine']) {
    if (modules[key]?.enabled === false) continue
    const sourceDrafts = draftActions.filter(action => action.key === key).map(action => action.record)
      .filter(record => key !== 'abnormal_followup' || !reviewExclusions.isExcluded(modules[key], record))
    const activeDraftIds = new Set(sourceDrafts.flatMap(record => record?.sourceIds || []).map(String))
    const oldRows = modules[key]?.records || []
    const retained = oldRows.filter(row => key !== 'abnormal_followup' || !reviewExclusions.isExcluded(modules[key], row)).filter(row => !row.screeningDraft || (row.sourceIds || []).some(id => activeDraftIds.has(String(id))))
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
      const suggested = source?.[dateKey]
      if (!suggested || row.visitGroupId || row.datePending || row.timingStatus === 'pending_confirmation') return nextRow
      if (row[dateKey] === suggested && row.screeningSuggestedDate === suggested) return nextRow
      const priorTarget = existing.find(target => row.sourceIds?.includes(target.issueId))
      const priorDate = row.screeningSuggestedDate || priorTarget?.directionTimings?.[key]?.firstDueDate
        || (priorTarget?.sourceGoals?.length === 1 ? priorTarget.actionTiming?.firstDueDate : '')
      const sourceOwned = row[dateKey] === priorDate || (!priorDate && row.screeningDraft && /^按(顾问|已确认)/.test(row.timingReason || ''))
      if (row[dateKey] && row[dateKey] !== suggested && !sourceOwned) return nextRow
      if (!row[dateKey] && row.appointmentSchedulingVersion) return nextRow
      return { ...nextRow, [dateKey]: suggested, screeningSuggestedDate: suggested,
        timingReason: row[dateKey] === suggested ? row.timingReason || source.timingReason || '' : source.timingReason || '',
        ...(source.appointmentSchedulingVersion === 1 ? { appointmentSchedulingVersion: 1 } : {}) }
    })
    const additions = sourceDrafts.filter(record =>
      !hydrated.some(row => (row.sourceIds || []).some(id => record.sourceIds?.includes(id))))
    if (JSON.stringify(hydrated) !== JSON.stringify(oldRows) || additions.length) next[key] = { ...(modules[key] || {}), enabled: true, records: [...hydrated, ...additions.map(record => ({ ...record, ...(record[dateKey] ? { screeningSuggestedDate: record[dateKey] } : {}), screeningDraft: true }))] }
  }
  const changed = JSON.stringify(next) !== JSON.stringify(modules)
  return { modules: changed ? next : modules, changed }
}
