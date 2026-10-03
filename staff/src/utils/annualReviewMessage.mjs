const NUMBERED_HEADING = /^(?:#{1,4}\s*)?([1-6])\s*[.、．]\s*(.{2,30})$/
const CHINESE_HEADING = /^([一二三四五六])\s*[、.．]\s*(.{2,30})$/
const BULLET = /^[•●▪·*\-]\s*(.+)$/
const ISSUE_HEADING = /^(?:【问题[：:]\s*(.{2,60})】|问题\s*\d+[：:]\s*(.{2,60}))$/
const SYNTHESIS_HEADING = /^【综合关联与优先级】$/

const splitRow = text => {
  const colon = text.search(/[：:]/)
  return colon > 0 && colon <= 18 ? { label: text.slice(0, colon).trim(), detail: text.slice(colon + 1).trim() } : { label: '', detail: text }
}

function parseIssueCards(lines) {
  const issues = []
  const intro = []
  let synthesis = null
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\*\*|__/g, '').replace(/^#{1,4}\s*/, '').trim()
    if (!line) continue
    const issue = line.match(ISSUE_HEADING)
    if (issue) { current = { title: (issue[1] || issue[2]).trim(), rows: [] }; issues.push(current); continue }
    if (SYNTHESIS_HEADING.test(line)) { synthesis = { title: '综合关联与优先级', rows: [] }; current = synthesis; continue }
    if (!current) { intro.push(line); continue }
    const bullet = line.match(BULLET)
    const text = (bullet ? bullet[1] : line).trim()
    if (text.search(/^[^：:]{2,18}[：:]/) === 0 || bullet || !current.rows.length) current.rows.push(text)
    else current.rows[current.rows.length - 1] += ` ${text}`
  }
  if (!issues.length) return null
  return { mode: 'issues', intro: intro.join(' '), sections: issues.map(section => ({ ...section, rows: section.rows.map(splitRow) })), synthesis: synthesis && { ...synthesis, rows: synthesis.rows.map(splitRow) } }
}

export function parseAnnualReviewMessage(content) {
  const lines = String(content || '').replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/)
  const issueCards = parseIssueCards(lines)
  if (issueCards) return issueCards
  const sections = []
  const intro = []
  let current = null
  for (const raw of lines) {
    const line = raw.replace(/\*\*|__/g, '').trim()
    if (!line) continue
    const heading = line.match(NUMBERED_HEADING) || line.match(CHINESE_HEADING)
    if (heading) {
      current = { title: heading[2].trim(), rows: [] }
      sections.push(current)
      continue
    }
    if (!current) { intro.push(line); continue }
    const bullet = line.match(BULLET)
    if (bullet || !current.rows.length) current.rows.push((bullet ? bullet[1] : line).trim())
    else current.rows[current.rows.length - 1] += ` ${line}`
  }
  if (sections.length < 2) return null
  return { mode: 'agenda', intro: intro.join(' '), sections: sections.map(section => ({ ...section, rows: section.rows.map(splitRow) })) }
}
