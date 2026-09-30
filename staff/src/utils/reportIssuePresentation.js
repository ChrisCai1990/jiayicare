import problemTaxonomy from '../../../shared/reportProblems.cjs'
export const problemGroups = problemTaxonomy.GROUPS
export function approvedScreeningReference(rows, year) {
  const annual = rows.find(row => Number(row.year) === Number(year))
  const records = annual ? (annual.records?.length ? annual.records : [annual]) : []
  return records.find(record => record.status === 'approved') || null
}
export function groupedIssues(issues) {
  return problemGroups.map(([key, label]) => ({ key, label, issues: issues.filter(issue => (issue.group || problemTaxonomy.groupFor(issue.title)) === key) })).filter(group => group.issues.length)
}
// Display-only deduplication. The original report and saved evidence stay intact.
export function compactEvidence(value = '') {
  const seen = new Set()
  return String(value).split(/\r?\n/).map(line => line.trim()).filter(line => {
    if (!line) return false
    const key = line.replace(/\s+/g, '')
    if (seen.has(key)) return false
    seen.add(key); return true
  }).join('\n')
}

export function evidenceSummary(value = '') {
  const lines = compactEvidence(value).split('\n')
  if (lines[0]?.startsWith('结果')) return lines.filter(line => /^结果|^参考范围/.test(line)).join('；')
  const conclusion = lines.find(line => /^\d+[.、．]/.test(line)) || lines[0] || ''
  return conclusion.length > 85 ? conclusion.slice(0, 85) + '…' : conclusion
}
