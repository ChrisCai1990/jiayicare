import React from 'react'

export const isCheckupMedicalExecutionTask = task => task?.sourceType === 'order' && task?.workflowKey === 'checkup_appointment:medical'
const label = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

const hasAppointment = appointment => Boolean(appointment?.campus && appointment?.department && appointment?.date && appointment?.time)

// Early orders recorded the check-day expert slot in postCheckExpertAppointment.
// Preserve that appointment when its department clearly identifies one requested check,
// instead of asking the medical assistant to enter the same appointment again.
const legacyBookedItem = (items, appointment) => {
  if (!hasAppointment(appointment)) return ''
  const context = `${appointment.department || ''} ${appointment.doctor || ''}`
  return items.find(item => (
    (/甲状腺/.test(item) && /甲乳|甲状腺/.test(context))
    || (/颈动脉/.test(item) && /颈动脉|血管/.test(context))
    || (/乳腺/.test(item) && /甲乳|乳腺/.test(context))
  )) || ''
}

export function checkupMedicalExecutionFromTask(task) {
  const data = task?.formData || {}; const booking = data.booking || {}
  const intake = data.intake || booking.intake || {}
  const existing = Array.isArray(data.checkAppointments) ? data.checkAppointments : []
  const requestedItems = (intake.checkItems || []).flatMap(item => String(item?.name || '').split(/[、，,\n；;]/).map(name => name.trim()).filter(Boolean))
  const special = booking.specialCheckAppointment || {}
  const finalVisit = booking.postCheckExpertAppointment || booking.expertAppointment || {}
  const legacyItem = !special.checkItem ? legacyBookedItem(requestedItems, finalVisit) : ''
  const checks = requestedItems.map((item, index) => {
    const specialBooked = special.checkItem && (String(special.checkItem).includes(item) || item.includes(String(special.checkItem)))
    const managerBooked = specialBooked || item === legacyItem
    const appointment = specialBooked ? special : (item === legacyItem ? finalVisit : null)
    return { item, department: managerBooked ? appointment?.department || '' : existing[index]?.department || '', campus: managerBooked ? appointment?.campus || '' : existing[index]?.campus || '', location: managerBooked ? appointment?.location || existing[index]?.location || '' : existing[index]?.location || '', appointmentDate: managerBooked ? appointment?.date || '' : existing[index]?.appointmentDate || '', appointmentTime: managerBooked ? appointment?.time || '' : existing[index]?.appointmentTime || '', managerBooked }
  })
  return { ...data, intake, booking, examOrderStatus: data.examOrderStatus || '', examOrderNote: data.examOrderNote || '', checkAppointments: checks, inspectionCompleted: !!data.inspectionCompleted, expertVisitCompleted: !!data.expertVisitCompleted, expertVisitSummary: data.expertVisitSummary || '', reportIds: data.reportIds || [], medicalRecordIds: data.medicalRecordIds || [] }
}

export function validateCheckupMedicalExecution(data) {
  if (!data.examOrderStatus) return '请填写开检查单情况'
  if ((data.checkAppointments || []).some(row => !row.campus?.trim() || !row.department?.trim() || !row.location?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请完整填写每项检查的院区、科室、具体地点和预约时间'
  const finalVisit = data.booking?.postCheckExpertAppointment || data.booking?.expertAppointment || {}
  if ((data.checkAppointments || []).some(row => !row.managerBooked && `${row.appointmentDate}T${row.appointmentTime}` >= `${finalVisit.date || ''}T${finalVisit.time || ''}`)) return '所有检查预约必须安排在专家看诊之前'
  return ''
}

export default function CheckupMedicalExecutionForm({ task, value, onChange }) {
  const data = checkupMedicalExecutionFromTask({ ...task, formData: value })
  const update = patch => onChange({ ...data, ...patch })
  const updateCheck = (index, patch) => update({ checkAppointments: data.checkAppointments.map((row, i) => i === index ? { ...row, ...patch } : row) })
  const finalVisit = data.booking?.postCheckExpertAppointment || data.booking?.expertAppointment || {}
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 12, borderRadius: 9, background: '#FFF8ED', fontSize: 13, lineHeight: 1.7 }}><b>既定预约：</b>{data.intake.institution || '—'}<br />开检查单：{[data.booking?.orderFormAppointment?.date, data.booking?.orderFormAppointment?.time].filter(Boolean).join(' ') || '—'}　专家看诊：{[finalVisit.date, finalVisit.time].filter(Boolean).join(' ') || '—'}</section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><b>① 开检查单情况</b><label style={label}>开单状态 *<select className="form-control" value={data.examOrderStatus} onChange={e => update({ examOrderStatus: e.target.value })}><option value="">请选择</option><option value="completed">已完成开单</option><option value="adjusted">已调整项目</option></select></label><label style={label}>开单说明（选填）<textarea className="form-control" rows={2} value={data.examOrderNote} onChange={e => update({ examOrderNote: e.target.value })} /></label></section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><b>② 检查项目预约与执行</b><span style={{ fontSize: 12, color: '#65776F' }}>逐项记录预约；所有检查须早于最终专家看诊。健管专员已预约的特殊检查会直接带入。</span>{data.checkAppointments.map((row, index) => <div key={`${row.item}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, paddingTop: index ? 8 : 0, borderTop: index ? '1px solid #E8EFEB' : 0 }}><label style={label}>检查项目<input className="form-control" disabled value={row.item} />{row.managerBooked && <small style={{ color: '#1E6B50' }}>{row.location ? '健管专员已预约，信息不可编辑' : '健管专员已预约，请补充具体地点'}</small>}</label><label style={label}>院区 *<input className="form-control" disabled={row.managerBooked} value={row.campus} onChange={e => updateCheck(index, { campus: e.target.value })} /></label><label style={label}>科室 *<input className="form-control" disabled={row.managerBooked} value={row.department} onChange={e => updateCheck(index, { department: e.target.value })} /></label><label style={label}>具体地点 *<input className="form-control" placeholder="例如：3号楼 2层 B区" disabled={row.managerBooked && !!row.location} value={row.location} onChange={e => updateCheck(index, { location: e.target.value })} /></label><label style={label}>日期 *<input type="date" className="form-control" disabled={row.managerBooked} value={row.appointmentDate} onChange={e => updateCheck(index, { appointmentDate: e.target.value })} /></label><label style={label}>时间 *<input type="time" className="form-control" disabled={row.managerBooked} value={row.appointmentTime} onChange={e => updateCheck(index, { appointmentTime: e.target.value })} /></label></div>)}</section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, background: '#F8FAF9', color: '#52685D', fontSize: 13, lineHeight: 1.7 }}><b>③ 后续自动跟进</b><br />保存本次开单与检查预约后，AI 将在检查完成后提醒客户上传检查报告和门诊病历，并同步健管专员审核。就医专员无需陪同、填写看诊记录或上传客户资料。</section>
  </div>
}
