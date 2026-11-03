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

// Compare only a single explicit numerical range from this report, never demographic ranges.
export function screeningStatus(row) {
  if (row.status === 'abnormal') return { abnormal:true, label:'异常', source:'报告记录标记' }
  if (row.status === 'attention') return { abnormal:false, attention:true, label:'关注', source:'报告记录标记' }
  if (row.status === 'normal') return { abnormal:false, label:'', source:'报告记录标记' }
  const raw = String(row.value ?? '').trim()
  if (/[↑↓]/.test(raw)) return { abnormal:true, label:raw.includes('↑') ? '↑ 偏高' : '↓ 偏低', source:'结果原文标记' }
  const unknown = { abnormal:false, label:'', source:'按原报告展示，未自动判定异常' }
  const bound = raw.match(/^(>=|<=|>|<|≥|≤)\s*(-?\d+(?:\.\d+)?)$/)
  if (bound) {
    const ref = String(row.referenceRange || '').replace(/\s/g,'')
    const range = ref.match(/^(-?\d+(?:\.\d+)?)[~～—–-](-?\d+(?:\.\d+)?)$/)
    const limit = ref.match(/^(<=|>=|<|>|≤|≥)(-?\d+(?:\.\d+)?)$/)
    const above = ['>','>=','≥'].includes(bound[1]), n = Number(bound[2])
    const upper = range ? Number(range[2]) : limit && ['<','<=','≤'].includes(limit[1]) ? Number(limit[2]) : null
    const lower = range ? Number(range[1]) : limit && ['>','>=','≥'].includes(limit[1]) ? Number(limit[2]) : null
    if (above && upper !== null && (n > upper || (n === upper && (bound[1] === '>' || limit?.[1] === '<')))) return { abnormal:true, label:'↑ 偏高', source:'结果下限已超出本报告参考范围' }
    if (!above && lower !== null && (n < lower || (n === lower && (bound[1] === '<' || limit?.[1] === '>')))) return { abnormal:true, label:'↓ 偏低', source:'结果上限已低于本报告参考范围' }
    return unknown
  }
  if (!/^-?\d+(?:\.\d+)?$/.test(raw)) return unknown
  const value = Number(raw), reference = String(row.referenceRange || '').replace(/\s/g,'')
  const range = reference.match(/^(-?\d+(?:\.\d+)?)[~～—–-](-?\d+(?:\.\d+)?)$/)
  if (range && Number(range[1]) <= Number(range[2])) {
    if (value < Number(range[1])) return { abnormal:true, label:'↓ 偏低', source:'低于本报告参考范围' }
    if (value > Number(range[2])) return { abnormal:true, label:'↑ 偏高', source:'高于本报告参考范围' }
    return { abnormal:false, label:'', source:'本报告参考范围内' }
  }
  const limit = reference.match(/^(<=|>=|<|>|≤|≥)(-?\d+(?:\.\d+)?)$/)
  if (limit) {
    const op=limit[1], n=Number(limit[2]);
    const valid=op==='<' ? value<n : ['<=','≤'].includes(op) ? value<=n : op==='>' ? value>n : value>=n
    return { abnormal:!valid, label:valid ? '' : ['<','<=','≤'].includes(op) ? '↑ 偏高' : '↓ 偏低', source:'与本报告参考范围比较' }
  }
  return unknown
}
