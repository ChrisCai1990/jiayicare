const markers = [
  ['HBV-DNA', /HBV[\s-]*DNA|乙肝.*DNA|乙型肝炎.*脱氧核糖核酸/i],
  ['乙肝表面抗原', /HBsAg|(?:乙肝|乙型肝炎).*表面抗原/i],
  ['乙肝表面抗体', /HBsAb|anti[\s-]*HBs|(?:乙肝|乙型肝炎).*表面抗体/i],
  ['乙肝 e 抗原', /HBeAg|(?:乙肝|乙型肝炎).*e抗原/i],
  ['乙肝 e 抗体', /HBeAb|(?:乙肝|乙型肝炎).*e抗体/i],
  ['乙肝核心抗体 IgM', /HBc.*IgM|(?:乙肝|乙型肝炎).*核心.*IgM/i],
  ['乙肝核心抗体', /HBcAb|(?:乙肝|乙型肝炎).*核心抗体/i],
  ['HCV-RNA', /HCV[\s-]*RNA|丙型肝炎.*核糖核酸/i],
  ['丙肝抗体', /HCV.*(?:Ab|抗体)|anti[\s-]*HCV|丙(?:肝|型肝炎).*抗体/i],
  ['AFP', /\bAFP\b|甲胎蛋白/i],
]
const normalize = value => String(value || '').replace(/\s/g, '').toLowerCase()
export function liverMarkerTrends(card) {
  if (card?.name !== '肝癌') return []
  const groups = new Map()
  for (const source of card.sourceEvidence || []) for (const row of source.items || []) {
    const marker = markers.find(([, pattern]) => pattern.test(row.name || ''))
    if (!marker || !String(row.value || '').trim()) continue
    const date = row.date || source.date || String(source.year || '')
    if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(date)) continue
    const point = { ...row, date, value: String(row.value).trim(), reportId: source.reportId }
    const points = groups.get(marker[0]) || []
    if (!points.some(p => p.date === date && p.value === point.value && p.unit === point.unit && p.referenceRange === point.referenceRange)) points.push(point)
    groups.set(marker[0], points)
  }
  return markers.filter(([name]) => groups.has(name)).map(([name]) => {
    const points = groups.get(name).sort((a, b) => a.date.localeCompare(b.date))
    const first = points[0], last = points.at(-1)
    const sameScale = points.every(p => normalize(p.unit) === normalize(first.unit)
      && normalize(p.referenceRange) === normalize(first.referenceRange))
    const conflict = points.some((p, i) => points.some((q, j) => i !== j && p.date === q.date
      && (p.value !== q.value || normalize(p.unit) !== normalize(q.unit))))
    const exact = points.every(p => /^\d+(?:\.\d+)?$/.test(p.value))
    let trend = '结果类型不同，需核对'
    if (points.length === 1) trend = '仅一次记录'
    else if (conflict) trend = '同日结果不一致，需核对'
    else if (!sameScale) trend = '单位或参考范围不同'
    else if (points.every(p => p.value === first.value)) trend = '历次报告结果一致'
    else if (exact && first.unit) trend = Number(last.value) > Number(first.value)
      ? '首末数值上升' : Number(last.value) < Number(first.value) ? '首末数值下降' : '首末相同，期间有变化'
    else if (points.some(p => /[<>＜＞≤≥]/.test(p.value))) trend = '含检测界限，不能计算增减'
    return { name, points, first, last, trend }
  })
}
export function liverKeyChanges(card) {
  const changes = card.keyChanges || []
  return liverMarkerTrends(card).length
    ? changes.filter(text => !/^(?:乙肝\/丙肝|肝炎)筛查原报告：/.test(text)) : changes
}
