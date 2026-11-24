// A review hint only: the printed range and measured value still need a human check.
export function isOutsidePrintedRange(item) {
  if (item?.itemType !== 'lab') return false
  const value = String(item.value ?? '').trim().normalize('NFKC')
  const range = String(item.referenceRange ?? '').trim().normalize('NFKC')
  const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/
  if (!numeric.test(value)) return false
  const measured = Number(value)
  const bounds = range.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*[-~–—至]\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/)
  if (bounds) {
    const lower = Number(bounds[1]), upper = Number(bounds[2])
    return lower <= upper && (measured < lower || measured > upper)
  }
  const limit = range.match(/^(<|>|≤|≥|<=|>=)\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))$/)
  if (!limit) return false
  const threshold = Number(limit[2])
  return ({ '<': measured >= threshold, '<=': measured > threshold, '≤': measured > threshold,
    '>': measured <= threshold, '>=': measured < threshold, '≥': measured < threshold })[limit[1]]
}

export function reportRangeMismatches(items) {
  return (items || []).filter(item => isOutsidePrintedRange(item) && item.status !== 'abnormal')
}
