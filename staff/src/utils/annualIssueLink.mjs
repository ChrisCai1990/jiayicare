export const targetIssueId = (target, index) => String(target?.issueId || (target?.sourceReviewId ? `review:${target.sourceReviewId}:target:${target.sourceIndex ?? index}` : `manual:${index}`))

export function linkedIssueId(record, targets) {
  const sourceIds = new Set((Array.isArray(record?.sourceIds) ? record.sourceIds : []).map(String))
  const direct = targets.map((target, index) => targetIssueId(target, index)).filter(id => sourceIds.has(id))
  if (direct.length === 1) return direct[0]
  if (direct.length > 1) return ''
  const explicit = String(record?.issueId || '')
  if (explicit) return targets.some((target, index) => targetIssueId(target, index) === explicit) ? explicit : ''
  const reviewIds = [...new Set((Array.isArray(record?.sourceIds) ? record.sourceIds : []).map(id => String(id).match(/^review:([^:]+)/)?.[1]).filter(Boolean))]
  if (reviewIds.length !== 1) return ''
  const matches = targets.map((target, index) => ({ target, index })).filter(({ target }) => String(target.sourceReviewId || '') === reviewIds[0])
  return matches.length === 1 ? targetIssueId(matches[0].target, matches[0].index) : ''
}

export function actionTitle(record, fallback) {
  return String(record?.items || record?.name || record?.reason || record?.focus || record?.standardPlanName || fallback).trim()
}

// Presentation only: ambiguous actions remain visible in the shared arrangements.
export function displayIssueId(record, targets) {
  const linked = linkedIssueId(record, targets)
  if (linked || record?.issueId) return linked
  const concepts = [/血压|ABPM/i, /动脉|斑块|Lp.?PLA2|血脂/i, /胃炎|胃镜|胃黏膜|PPI|胆汁/i,
    /肺|胸部CT|LDCT/i, /直肠|息肉/i, /盲肠|腺瘤/i, /前列腺/i, /贫血|血红蛋白电泳/i]
  const action = [record.items, record.name, record.reason, record.focus].filter(Boolean).join(' ')
  const hits = targets.map((target, index) => ({ id: targetIssueId(target, index),
    score: concepts.filter(pattern => pattern.test(action) && pattern.test(target.goal || target.sourceGoal || '')).length }))
  const best = Math.max(0, ...hits.map(row => row.score))
  const matches = hits.filter(row => row.score === best)
  return best > 0 && matches.length === 1 ? matches[0].id : ''
}

export function actionTargetIds(action, targets) {
  const known = new Set(targets.map((row, index) => targetIssueId(row, index)))
  return [...new Set([action.issueId, action.record?.issueId,
    ...(action.record?.issueIds || []), ...(action.record?.sourceIds || [])]
    .filter(Boolean).map(String).filter(id => known.has(id)))]
}

// Group same-day, same-category arrangements for review. Each action and its
// source evidence stay separate unless the backend has established one visit.
export function groupTargetsBySharedActions(targets, actions) {
  const groups = targets.map((row, index) => ({ entries: [{ row, index }], ids: [targetIssueId(row, index)] }))
  const merge = ids => {
    const matching = groups.filter(group => group.ids.some(id => ids.includes(id)))
    if (matching.length < 2) return
    const first = matching[0]
    for (const group of matching.slice(1)) {
      first.entries.push(...group.entries)
      first.ids.push(...group.ids)
      groups.splice(groups.indexOf(group), 1)
    }
    first.entries.sort((a, b) => a.index - b.index)
  }
  for (const action of actions) {
    merge(actionTargetIds(action, targets))
  }
  const byDayAndCategory = new Map()
  for (const action of actions) {
    const date = String(action.date || '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const category = String(action.key || '')
    if (!['medical_treatment', 'checkup_completion', 'abnormal_followup', 'vaccine', 'personalized_followups'].includes(category)) continue
    const template = category === 'personalized_followups' ? String(action.record?.standardPlanId || action.record?.standardPlanName || '') : ''
    const key = `${category}:${template}:${date}`
    byDayAndCategory.set(key, [...(byDayAndCategory.get(key) || []), ...actionTargetIds(action, targets)])
  }
  for (const ids of byDayAndCategory.values()) merge([...new Set(ids)])
  return groups
}
