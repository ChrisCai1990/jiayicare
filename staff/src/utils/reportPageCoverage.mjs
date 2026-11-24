// Show only evidence we can actually establish. A page without extracted items
// needs inspection, but is not necessarily a missed medical result.
export function summarizeReportPages(pages, items, imageEvidence = {}, textCoverage = {}, pageParseStatusByPage = {}, failedPages = []) {
  const gaps = new Set((textCoverage.pagesWithGaps || []).map(Number))
  const failed = new Set(failedPages.map(Number))
  return pages.map(page => {
    const pageItems = (items || []).filter(item => Number(item.sourcePage || 1) === page)
    const evidence = imageEvidence[page] || {}
    const parse = pageParseStatusByPage[page] || {}
    const reasons = []
    const blocked = evidence.blockedReasons || {}
    if (failed.has(page)) reasons.push('首轮识别失败或不完整')
    if (gaps.has(page)) reasons.push('文字层结果行待核对')
    if (blocked.uncovered_rows > 0) reasons.push(`原件结果行待补 ${blocked.uncovered_rows}`)
    if (blocked.uncovered_sections > 0) reasons.push(`检查栏目待核对 ${blocked.uncovered_sections}`)
    if (evidence.status === 'needs_review' && !blocked.uncovered_rows && !blocked.uncovered_sections)
      reasons.push('原文待核对')
    if (parse.status === 'failed') reasons.push('本页补提失败')
    else if (parse.status === 'needs_review' && !reasons.length) reasons.push('补提结果待核对')
    if (!pageItems.length && evidence.status !== 'image_only') reasons.push('无提取数据，请查看原件')
    return { page, itemCount: pageItems.length, reasons, needsAttention: reasons.length > 0,
      label: evidence.status === 'image_only' && !reasons.length ? '影像资料页' : reasons[0] || `${pageItems.length} 项` }
  })
}
