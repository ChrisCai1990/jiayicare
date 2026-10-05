import { calendarDate } from './calendarDate.mjs'

export function resolveReportReviewDate(enteredDate, itemDates, extraPageDates = []) {
  const entered = String(enteredDate || '').trim()
  const confirmed = calendarDate(entered)
  if (entered && !confirmed) throw new Error('请填写完整有效的检查日期后保存')
  if (confirmed) return confirmed
  const normalizedItems = itemDates.map(calendarDate)
  const unique = [...new Set([...normalizedItems, ...extraPageDates.map(calendarDate)].filter(Boolean))]
  return unique.length === 1 && normalizedItems.every(Boolean) ? unique[0] : ''
}
