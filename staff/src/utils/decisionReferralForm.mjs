import { calendarDate } from '../../../shared/calendarDate.mjs'

export function referralDateTime(day, time) {
  const date = calendarDate(day)
  const match = String(time || '').match(/^(\d{2}):(\d{2})$/)
  if (!date || !match || Number(match[1]) > 23 || Number(match[2]) > 59) return ''
  return `${date}T${time}`
}

export function filterReferralReports(reports, query) {
  const terms = String(query || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return reports.filter(report => {
    if (!report.fileUrl && !report.fileUrls?.length) return false
    const searchText = [report.title, report.checkDate, report.date, report.documentCategory]
      .map(value => String(value || '').toLocaleLowerCase()).join(' ')
    return terms.every(term => searchText.includes(term))
  })
}
