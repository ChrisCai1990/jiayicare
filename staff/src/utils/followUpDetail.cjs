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
function appointmentLines(plan = {}, booking = {}) {
  plan = plan || {}; booking = booking || {}
  const text = value => typeof value === 'string' ? value.trim() : ''
  const lines = []
  const hospital = text(booking.hospital) || text(plan.hospital)
  if (hospital) lines.push(`医院：${hospital}`)
  const slots = Array.isArray(booking.appointmentSlots) && booking.appointmentSlots.length ? booking.appointmentSlots
    : Array.isArray(booking.prescribingAppointments) && booking.prescribingAppointments.length ? booking.prescribingAppointments : [booking]
  slots.forEach((row, index) => {
    const values = [['院区',text(row.campus)||text(booking.campus)||text(plan.campus)],['科室',text(row.department)||text(plan.department)],['医生',text(row.expert)||text(row.doctorName)||text(booking.appointmentExpert)||text(plan.expert)],['预约时间',[text(row.appointmentDate),text(row.appointmentTime)].filter(Boolean).join(' ')]].filter(([,v])=>v).map(([k,v])=>`${k}：${v}`)
    if(values.length) lines.push(`${slots.length>1?`预约${index+1} · `:''}${values.join('；')}`)
  })
  return lines
}
module.exports = { mergeFollowUpDetail, displayDate, orderAmount, appointmentLines }
