export function calendarDate(value) {
  const raw = String(value || '').trim()
  const match = raw.match(/^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/) || raw.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (!match) return ''
  const [, year, month, day] = match
  const canonical = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  const date = new Date(`${canonical}T00:00:00Z`)
  return Number(year) > 0 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === canonical ? canonical : ''
}
