const NUMBERED_HEADING = /^(?:#{1,4}\s*)?([1-6])\s*[.、．]\s*(.{2,30})$/
const CHINESE_HEADING = /^([一二三四五六])\s*[、.．]\s*(.{2,30})$/
const BULLET = /^[•●▪·*\-]\s*(.+)$/

export function parseAnnualReviewMessage(content) {
  const lines = String(content || '').replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/)
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
  return { intro: intro.join(' '), sections: sections.map(section => ({ ...section, rows: section.rows.map(text => {
    const colon = text.search(/[：:]/)
    return colon > 0 && colon <= 18 ? { label: text.slice(0, colon).trim(), detail: text.slice(colon + 1).trim() } : { label: '', detail: text }
  }) })) }
}
