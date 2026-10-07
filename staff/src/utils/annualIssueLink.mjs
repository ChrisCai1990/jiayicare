export const targetIssueId = (target, index) => String(target?.issueId || (target?.sourceReviewId ? `review:${target.sourceReviewId}:target:${target.sourceIndex ?? index}` : `manual:${index}`))

export function linkedIssueId(record, targets) {
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
