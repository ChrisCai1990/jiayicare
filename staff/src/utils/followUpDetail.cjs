function idOf(value) {
  return String(value?._id || value || '')
}
function mergeFollowUpDetail(previous, updated, staffList = []) {
  const merged = { ...previous, ...updated }
  for (const key of ['assignedTo', 'staffId', 'sourceOrderId']) {
    const current = merged[key]
    if (current && typeof current !== 'object') {
      if (idOf(previous?.[key]) === idOf(current) && typeof previous?.[key] === 'object') merged[key] = previous[key]
      else if (key !== 'sourceOrderId') merged[key] = staffList.find(person => idOf(person) === idOf(current)) || current
    }
  }
  return merged
}
function displayDate(value, withTime = false) {
  if (!value) return '未提供'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未提供'
  return withTime ? date.toLocaleString('zh-CN', { hour12: false }) : date.toLocaleDateString('zh-CN')
}
function orderAmount(order) {
  const value = order?.paidAmount ?? order?.servicePrice
  return value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) ? `¥${value}` : '金额未提供'
}
module.exports = { mergeFollowUpDetail, displayDate, orderAmount }
