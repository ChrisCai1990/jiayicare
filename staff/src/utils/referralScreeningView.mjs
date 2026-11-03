// Old snapshots retain their original text; only unambiguous numeric rows become columns.
export function screeningView(item) {
  if (Array.isArray(item.结果明细)) return { rows:item.结果明细, notes:item.原文补充 || [], findings:item.检查所见 || '', conclusion:item.报告结论 || '' }
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

// Classify presentation only; original snapshots and report values remain unchanged.
const examinationName = value => /超声|彩超|B超|心电图|胃镜|肠镜|内镜|磁共振|骨密度|肺功能|眼底|[Xx]线|(?:^|[^a-z])(?:CT|MRI|DXA|ECG)(?:$|[^a-z])/i.test(String(value || ''))
// Legacy snapshots may omit itemType, numeric values or reference ranges (e.g. urine qualitative results).
const laboratoryName = value => /尿常规|尿液分析|尿液常规|(?:25(?:羟基|羟|oh)?维生素d|25ohd|25hydroxyvitamind|维生素d测定)/i.test(String(value || '').replace(/[\s\-－—（）()［\]\[·.]/g, ''))
function rowCategory(row, item) {
  if (row.itemType === 'imaging' || row.itemType === 'data') return 'exam'
  if (row.itemType === 'lab') return 'lab'
  if (row.itemType === 'medication') return 'other'
  if (examinationName(row.name) || examinationName(item.项目)) return 'exam'
  if (laboratoryName(row.name) || laboratoryName(item.项目) || laboratoryName(item.报告)) return 'lab'
  if (row.findings) return 'exam'
  if (row.referenceRange && row.value !== '' && row.value != null) return 'lab'
  if (row.conclusion) return 'exam'
  return 'other'
}
export function groupScreenings(records = []) {
  const groups = [{ key:'lab', label:'检验', items:[] }, { key:'exam', label:'检查', items:[] }, { key:'other', label:'其他资料', items:[] }]
  for (const item of records) {
    const view = screeningView(item)
    const buckets = { lab:[], exam:[], other:[] }
    view.rows.forEach(row => buckets[rowCategory(row,item)].push(row))
    const narrative = !!(view.findings || view.conclusion)
    const noteCategory = examinationName(item.项目) || examinationName(item.报告) ? 'exam'
      : laboratoryName(item.项目) || laboratoryName(item.报告) ? 'lab' : narrative ? 'exam' : 'other'
    // No structured evidence: keep the entire original record visible.
    if (!view.rows.length) {
      groups.find(group => group.key === noteCategory).items.push(item)
      continue
    }
    for (const group of groups) {
      const notes = group.key === noteCategory ? view.notes : []
      if (!buckets[group.key].length && !(group.key === noteCategory && narrative) && !notes.length) continue
      group.items.push({ ...item, 结果明细:buckets[group.key], 原文补充:notes,
        检查所见:group.key === noteCategory ? view.findings : '', 报告结论:group.key === noteCategory ? view.conclusion : '' })
    }
  }
  return groups.filter(group => group.items.length)
}

// Group only equal project names after typographic normalization. Do not merge clinical variants.
export function screeningProjects(records = []) {
  const groups = new Map()
  records.forEach((item, index) => {
    const name = String(item.项目 || '').trim()
    const key = name ? name.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : `unnamed:${index}`
    if (!groups.has(key)) groups.set(key, { key, name: name || '未命名项目', items: [] })
    groups.get(key).items.push(item)
  })
  const dateKey = item => {
    const match = String(item.日期 || '').match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/)
    return match ? `${match[1]}${match[2].padStart(2,'0')}${match[3].padStart(2,'0')}` : ''
  }
  return [...groups.values()].map(group => ({ ...group, items: [...group.items].sort((a,b) => dateKey(b).localeCompare(dateKey(a))) }))
}
