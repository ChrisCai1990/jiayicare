const norm = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
export function reportReviewConcerns(items) {
  const groups = new Map()
  const concerns = []
  items.forEach((item, index) => {
    const issues = [...(Array.isArray(item.reviewIssues) ? item.reviewIssues : [])]
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
