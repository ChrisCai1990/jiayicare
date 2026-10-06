const reviewedKinds = new Set(['ai_health_trend', 'reviewed_chronic_tag', 'reviewed_cardiovascular_tag'])

export function concernStatusLabel(row) {
  if (row.status === 'included') return '纳入综合研判'
  if (row.status === 'watch') return '继续观察'
  if (row.status === 'duplicate') return '与其他问题重复'
  if (row.status === 'excluded') return '不纳入'
  return reviewedKinds.has(row.kind) ? '来源已审核 · 待确定年度去向' : '待核实'
}

export function concernSourceLabel(row) {
  const sources = row.mergedSources?.length ? row.mergedSources : [row]
  return [...new Set(sources.map(item => item.includedByName).filter(Boolean))].join('、') ||
    (row.kind === 'ai_health_trend' ? '已审核健康趋势' : row.kind === 'screening' ? '已审核筛查报告' : '年度研判资料')
}
