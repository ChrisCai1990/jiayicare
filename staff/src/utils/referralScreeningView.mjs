// Old snapshots retain their original text; only unambiguous numeric rows become columns.
export function screeningView(item) {
  if (Array.isArray(item.结果明细)) return { rows:item.结果明细, notes:[], findings:item.检查所见 || '', conclusion:item.报告结论 || '' }
  const rows = [], notes = []
  for (const line of String(item.结果 ?? '').split(/[；\n]+/).filter(s => s.trim())) {
    const parts = line.split(/参考范围[：:]/)
    const match = parts.length === 2 && parts[0].trim().match(/^(.+?)\s+([<>≤≥]?\s*-?\d+(?:\.\d+)?)(?:\s+([^\s]+))?$/)
    if (match) rows.push({ name:match[1], value:match[2], unit:match[3] || '', referenceRange:parts[1].trim() })
    else notes.push(line)
  }
  return { rows, notes, findings:'', conclusion:'' }
}
export function referenceLines(value) {
  return String(value || '').split(/(?:&|\n)+/).map(s=>s.trim()).filter(Boolean)
}
