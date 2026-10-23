export function aiReviewConflictGuidance(conflict) {
  const marker = String(conflict?.marker || '该指标')
  const evidence = Array.isArray(conflict?.evidence) ? conflict.evidence : []
  const latest = evidence.find(row => row.date)
  const latestLabel = latest
    ? `${latest.date} 的检测值 ${latest.value || '未提供'}（参考 ${latest.referenceRange || '未提供'}）`
    : '最近一次有日期的检测'

  if (conflict?.reason === 'latest_not_elevated') {
    const latestResult = latest?.classification === 'normal' ? '未高于该次报告的参考上限' : '无法确认高于该次报告的参考上限'
    return {
      reason: `${latestLabel}${latestResult}。既往有过超上限记录，也不能据此认定目前仍在升高。`,
      suggestion: latest?.classification === 'normal'
        ? `核对原件后，将“${marker}持续/近期升高”等表述改为“${marker}既往曾高于当时参考上限，最近一次未高于报告参考上限”；保留其他结论前也请分别核对依据。`
        : `先核对最近一次来源报告的数值、参考范围和日期；仍无法确认时，删除“${marker}目前/持续升高”等未经证实的表述。`,
    }
  }
  if (conflict?.reason === 'insufficient_repeated_evidence') {
    return {
      reason: `现有检验依据不足以证明${marker}至少两次高于各次报告参考上限，因此不能写“持续”或“反复升高”。`,
      suggestion: `核对原件后，删除“持续/反复”等趋势措辞；可只描述已经核实的单次超上限记录及其日期。若检测值或参考范围有误，请先修改来源报告。`,
    }
  }
  return {
    reason: `当前可核对的${marker}检测值中，未找到能证明高于该次报告参考上限的记录。`,
    suggestion: `先核对来源报告的数值、参考范围和日期；若原件无误，请删除“${marker}升高”的结论，或如实描述已核实的检测结果。`,
  }
}
