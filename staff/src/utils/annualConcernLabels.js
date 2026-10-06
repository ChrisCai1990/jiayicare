const reviewedKinds = new Set(['ai_health_trend', 'reviewed_chronic_tag', 'reviewed_cardiovascular_tag', 'reviewed_tumor_tag'])

export function concernClinicalType(row) {
  if (!reviewedKinds.has(row.kind)) return row.clinicalType || 'health_issue'
  const title = String(row.title || '').replace(/\s/g, '')
  if (/[？?]$/.test(title) || /^待排/.test(title)) return 'question'
  if (/^(?:脂蛋白磷脂酶A2|Lp-?PLA2|同型半胱氨酸|Hcy)$/i.test(title)) return 'marker'
  if (/(?:超声|彩超|CTA|MRA|MRI|CT|磁共振|心电图|胃镜|肠镜|X线|造影)$/.test(title)) return 'examination'
  if (/(?:结节|息肉|斑块|增大|钙化|肠化|异位|异常|升高|降低|反流)/.test(title)) return 'finding'
  return 'health_issue'
}

export function isEvidenceConcern(row) {
  return ['examination', 'marker'].includes(concernClinicalType(row))
}

export function isActiveAnnualConcern(row) {
  return row.sourceState !== 'historical' && !(row.kind === 'ai_risk_scan' && String(row.key || '').startsWith('ai_risk:'))
}

export function concernTypeLabel(row) {
  return { examination: '检查依据', marker: '检验指标', question: '待确认疑点', finding: '检查发现', health_issue: '健康问题' }[concernClinicalType(row)]
}

export function concernStatusLabel(row) {
  if (isEvidenceConcern(row)) return row.status === 'excluded' ? '不采用此依据' : row.status === 'duplicate' ? '重复依据' : row.status === 'watch' ? '待复核依据' : '来源已审核 · 作为依据'
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
