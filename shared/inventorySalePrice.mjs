export function salePriceLabelForUnits(prices, units, selectedLabel = '') {
  const count = Number(units)
  if (units === '' || !Number.isInteger(count) || count < 1) return ''
  const exact = (prices || []).filter(row => Number(row.units) === count)
  if (exact.length === 1) return exact[0].label
  const selected = (prices || []).find(row => row.label === selectedLabel)
  return selected && count % Number(selected.units) === 0 ? selectedLabel : ''
}
