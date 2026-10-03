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
  return String(record?.items || record?.name || record?.standardPlanName || record?.focus || record?.reason || fallback).trim()
}
