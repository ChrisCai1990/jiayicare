function quarterOf(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month)
  return match ? match[1]+'-Q'+Math.ceil(Number(match[2])/3) : ''
}

function targetsForMonth(history, month) {
  const quarter = quarterOf(month)
  const matching = history.filter(entry => quarter && entry?.quarterKey === quarter && entry.periodKey <= month)
  matching.sort((a,b) => b.periodKey.localeCompare(a.periodKey) || new Date(b.updatedAt)-new Date(a.updatedAt))
  return matching[0] || history.find(entry => !entry?.quarterKey && entry?.periodKey === month)
}

module.exports = {quarterOf,targetsForMonth}
