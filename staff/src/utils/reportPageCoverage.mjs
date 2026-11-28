const heading = value => String(value || '').normalize('NFKC').replace(/[【】「」『』\s]/g, '')

// A saved OCR warning describes the draft at extraction time. Reconcile only
// identified sections with a unique reviewed result on the same page.
export function currentPageEvidence(evidence, items) {
  if (!Array.isArray(evidence?.uncoveredSections) || !evidence.uncoveredSections.length) return evidence
  const titles = evidence.uncoveredSections
  const conflicts = []
  const remaining = titles.filter(title => {
    const key = heading(title)
    if (/^(诊断结论|检查结果|检查所见)$/.test(key)) return false
    const matches = items.filter(item => ['imaging', 'diagnosis', 'pathology'].includes(item.itemType)
      && heading(item.name) === key)
    if (matches.length !== 1) return true
    const item = matches[0]
    if (item.manualReviewStatus !== 'reviewed' || !String(item.findings || item.diagnosis || item.conclusion || '').trim()) return true
    if (/甲状腺/.test(key) && /心脏|心超/.test([item.sourceSection, item.orderName].join(' '))) {
      conflicts.push(`${item.name}已有人工核对结果，保存的栏目为“${item.orderName || item.sourceSection}”`)
      return false
    }
    return ![item.sourceSection, item.orderName].filter(Boolean).every(value => heading(value) === key)
  })
  if (remaining.length === titles.length) return evidence
  const count = Math.max(0, Number(evidence.blockedReasons?.uncovered_sections || titles.length) - titles.length) + remaining.length
  const blockedReasons = { ...evidence.blockedReasons, uncovered_sections: count, reviewed_section_conflict: conflicts.length }
  const prior = String(evidence.message || '').replace(/原件有\d+个检查栏目未与审核草稿核对匹配：[\s\S]*?请逐项对照原件核对。/g, '').trim()
  const message = [prior, ...conflicts, count && `尚有 ${count} 个原件栏目待核对${remaining.length ? '：' + remaining.join('、') : ''}。`].filter(Boolean).join(' ')
  const resolved = !count && !prior && !evidence.blockedCount && !Object.values(blockedReasons).some(value => value > 0)
  return { ...evidence, status: resolved ? 'verified' : evidence.status, message, blockedReasons, uncoveredSections: remaining }
}

// Show only evidence we can actually establish. A page without extracted items
// needs inspection, but is not necessarily a missed medical result.
export function summarizeReportPages(pages, items, imageEvidence = {}, textCoverage = {}, pageParseStatusByPage = {}, failedPages = []) {
  const gaps = new Set((textCoverage.pagesWithGaps || []).map(Number))
  const failed = new Set(failedPages.map(Number))
  return pages.map(page => {
    const pageItems = (items || []).filter(item => Number(item.sourcePage || 1) === page)
    const evidence = currentPageEvidence(imageEvidence[page], pageItems) || {}
    const parse = pageParseStatusByPage[page] || {}
    const reasons = []
    const blocked = evidence.blockedReasons || {}
    if (failed.has(page)) reasons.push('首轮识别失败或不完整')
    if (gaps.has(page)) reasons.push('文字层结果行待核对')
    if (blocked.reviewed_section_conflict > 0) reasons.push(`已核对项目栏目不符 ${blocked.reviewed_section_conflict}`)
    if (blocked.uncovered_rows > 0) reasons.push(`原件结果行待补 ${blocked.uncovered_rows}`)
    if (blocked.uncovered_sections > 0) reasons.push(`检查栏目待核对 ${blocked.uncovered_sections}`)
    if (evidence.status === 'needs_review' && !blocked.reviewed_section_conflict && !blocked.uncovered_rows && !blocked.uncovered_sections)
      reasons.push('原文待核对')
    if (parse.status === 'failed') reasons.push('本页补提失败')
    else if (parse.status === 'needs_review' && !(evidence.status === 'verified' && imageEvidence[page]?.status === 'needs_review') && !reasons.length) reasons.push('补提结果待核对')
    if (!pageItems.length && !['image_only', 'summary_only'].includes(evidence.status)) reasons.push('无提取数据，请查看原件')
    return { page, itemCount: pageItems.length, reasons, needsAttention: reasons.length > 0,
      label: evidence.status === 'image_only' && !reasons.length ? '影像资料页' : reasons[0] || (evidence.status === 'summary_only' && !pageItems.length ? '体检小结' : `${pageItems.length} 项`) }
  })
}
