const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
export function reportItemNameConcern(item) {
  const name = String(item.name || '').trim()
  if (item.itemType === 'imaging' && name.length > 30 && /[；;。\n]|[：:].*[，,]/.test(name)) {
    return '项目名称疑似混入检查所见，请对照原件栏目核对；正文应保留在检查结果中'
  }
  return ''
}

export function reportClassificationLabels(item, catalog) {
  const keys = [...new Set([...(Array.isArray(item.screeningKeys) ? item.screeningKeys : []), item.screeningKey].filter(Boolean))]
  const options = catalog.flatMap(group => (group.opts || []).map(option => ({ ...option, groupLabel: group.label })))
  return keys.map(key => {
    const option = options.find(entry => entry.value === key)
    if (option) return (option.path?.length ? option.path : [option.groupLabel, ...option.label.split(' / ')])
      .filter((part, index, parts) => part && (index === 0 || part !== parts[index - 1])).join(' → ')
    // Do not treat a stale key as a confirmed Admin category, or expose raw database IDs.
    const saved = String(key).split('|').slice(1).filter(Boolean)
    return `原归类：${[...new Set(saved)].join(' → ') || '未知'}（当前目录未找到，待 Admin 核对）`
  })
}

export function reportNameCorrection(item) {
  if (!reportItemNameConcern(item)) return null
  const title = String(item.sourceSection || '').trim()
  if (!title || title.length > 30 || /[；;。\n]/.test(title)) return null
  const texts = [item.orderName, item.name, item.findings].map(value => String(value || '').trim()).filter(Boolean)
  // Preserve the misplaced original text, including complementary findings.
  const findings = texts.filter((value, index) => !texts.some((other, otherIndex) =>
    otherIndex !== index && norm(other).includes(norm(value)) && (norm(other) !== norm(value) || otherIndex < index)))
    .join('\n')
  return { name: title, orderName: title, findings, manualReviewStatus: 'pending', manualReviewedAt: null }
}

export function sameReportConclusion(item) {
  return !norm(item.conclusion) || !norm(item.diagnosis) || norm(item.conclusion) === norm(item.diagnosis)
}

export function reportReviewConcerns(items) {
  const groups = new Map()
  const concerns = []
  items.forEach((item, index) => {
    const issues = [...(Array.isArray(item.reviewIssues) ? item.reviewIssues : [])]
    const nameConcern = reportItemNameConcern(item)
    if (nameConcern) issues.push(nameConcern)
    if (!item.value && !item.findings && !item.diagnosis) issues.push('缺少可核对的结果')
    if (issues.length && item.manualReviewStatus !== 'reviewed') concerns.push({ index, message: issues.join('；') })
    const key = [item.name, item.itemType, item.examDate, item.specimen, item.bodyPart, item.modality].map(norm).join('|')
    if (norm(item.name)) {
      if (groups.has(key)) concerns.push({ index, other: groups.get(key), message: '疑似重复，请对照后保留或删除' })
      else groups.set(key, index)
    }
  })
  return concerns
}
