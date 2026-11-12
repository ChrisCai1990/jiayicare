// Compare the first and last measurements displayed in one trend chart.
export function trendChange(data) {
  if (!Array.isArray(data) || data.length < 2) return null
  const first = data[0]
  const last = data[data.length - 1]
  if (!Number.isFinite(first?.y) || !Number.isFinite(last?.y)) return null

  // Keep ordinary decimal measurements from showing binary floating point noise.
  const difference = Number((last.y - first.y).toPrecision(12))
  return {
    first: first.y,
    last: last.y,
    direction: difference > 0 ? '上升' : difference < 0 ? '下降' : '持平',
    amount: Math.abs(difference),
  }
}
