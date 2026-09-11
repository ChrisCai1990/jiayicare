import React from 'react'

export const isOutpatientProxyVisitTask = task => task?.taskRole === 'executor' && /门诊一站式.*首次代诊开检查单/.test(task?.theme || '')
const bookingFromTask = task => task?.dependsOnTaskId?.formData?.bookingSnapshot || {}
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
const scheduleText = row => [row?.appointmentDate, row?.appointmentTime].filter(Boolean).join(' ') || '时间待确认'
const inspectionDateFrom = booking => booking?.specialCheckAppointments?.find(row => row.appointmentDate)?.appointmentDate || booking?.postCheckAppointment?.appointmentDate || ''

export const emptyOutpatientProxyVisit = (task, value) => {
  const saved = value || {}
  const booking = saved.bookingSnapshot || bookingFromTask(task)
  const suggested = (booking.specialCheckAppointments || []).map(row => ({ item: row.item || '', expertName: row.expertName || '', appointmentDate: row.appointmentDate || '', appointmentTime: row.appointmentTime || '' }))
  return { proxyVisitCompleted: !!saved.proxyVisitCompleted, proxyVisitResult: saved.proxyVisitResult || '', examOrderSummary: saved.examOrderSummary || '', checkAppointments: saved.checkAppointments?.length ? saved.checkAppointments : suggested, bookingSnapshot: booking }
}

export const validateOutpatientProxyVisit = value => {
  if (!value?.proxyVisitCompleted) return '请确认已完成首次代诊'
  if (!value?.proxyVisitResult?.trim()) return '请填写专家诊疗意见及医嘱'
  if (!value?.examOrderSummary?.trim()) return '请填写本次代诊实际开具的检验检查单/项目'
  if (!value?.checkAppointments?.length) return '请填写检查预约安排'
  if (value.checkAppointments.some(row => !row.item?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请完整填写每项检查的项目、预约日期和时间'
  const inspectionDate = inspectionDateFrom(value.bookingSnapshot)
  if (inspectionDate && value.checkAppointments.some(row => row.appointmentDate !== inspectionDate)) return `所有检查应安排在检查日 ${inspectionDate}`
  const expert = value.bookingSnapshot?.postCheckAppointment
  if (expert?.appointmentDate && expert?.appointmentTime && value.checkAppointments.some(row => row.appointmentDate > expert.appointmentDate || (row.appointmentDate === expert.appointmentDate && row.appointmentTime >= expert.appointmentTime))) return '检查应安排在检查后专家门诊之前'
  return ''
}

export default function OutpatientProxyVisitForm({ task, value, onChange }) {
  const data = emptyOutpatientProxyVisit(task, value); const booking = data.bookingSnapshot || {}; const inspectionDate = inspectionDateFrom(booking)
  const update = patch => onChange({ ...data, ...patch }); const updateCheck = (index, patch) => update({ checkAppointments: data.checkAppointments.map((row, i) => i === index ? { ...row, ...patch } : row) })
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 13, borderRadius: 10, background: '#FFFAF2', border: '1px solid #E8DCC8', display: 'grid', gap: 9 }}><b style={{ color: '#6F5222' }}>健管专员确认的代诊日信息（首次代诊执行，只读）</b><div><b>{booking.hospital || '医院待确认'} · {booking.campus || '院区待确认'}</b></div>{(booking.prescribingAppointments || []).map((row, index) => <div key={index}><div>代诊科室/专家：{row.department || '待确认'} · {row.doctorName || '待确认'} · {scheduleText(row)}</div><div>需要开具：<b>{row.coveredChecks || '未填写'}</b></div><div>需向专家沟通：{row.communicationContent || '无特别说明'}</div></div>)}<div>预约补充说明：{booking.bookingNote || '无'}</div></section>
    <section style={{ padding: 13, borderRadius: 10, background: '#F2F8F5', border: '1px solid #B9DDD0', display: 'grid', gap: 6 }}><b style={{ color: '#1E6B50' }}>检查日总体安排（只读）</b><div>检查日：<b>{inspectionDate || '待确认'}</b></div>{(booking.specialCheckAppointments || []).map((row, index) => <div key={index}>已知特殊检查：{row.item || '待确认'}{row.expertName ? ` · ${row.expertName}` : ''} · {scheduleText(row)}</div>)}<div>检查后专家门诊：{booking.postCheckAppointment ? `${booking.postCheckAppointment.department || '科室待确认'} · ${booking.postCheckAppointment.expertName || '专家待确认'} · ${scheduleText(booking.postCheckAppointment)}` : '待确认'}</div><div style={{ fontSize: 12, color: '#65776F' }}>其他检查单也要约到同一检查日，并确保全部检查早于检查后专家门诊。</div></section>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={data.proxyVisitCompleted} onChange={e => update({ proxyVisitCompleted: e.target.checked })} />确认已完成首次代诊</label>
    <label style={labelStyle}>专家诊疗意见及医嘱 *<textarea className="form-control" rows={3} value={data.proxyVisitResult} onChange={e => update({ proxyVisitResult: e.target.value })} placeholder="记录专家对病情的判断、用药意见、后续检验检查及复诊建议" /></label>
    <label style={labelStyle}>本次代诊实际开具的检验检查单/项目 *<textarea className="form-control" rows={3} value={data.examOrderSummary} onChange={e => update({ examOrderSummary: e.target.value })} placeholder="填写专家实际开具的全部检验、检查项目，包括原计划项目和临时新增项目" /></label>
    <section style={{ border: '1px solid #B9DDD0', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><b>检查预约安排（含新增检查单）</b>{data.checkAppointments.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: 8 }}><input className="form-control" value={row.item || ''} onChange={e => updateCheck(index, { item: e.target.value })} placeholder="检查项目" /><input className="form-control" value={row.expertName || ''} onChange={e => updateCheck(index, { expertName: e.target.value })} placeholder="检查专家（选填）" /><input type="date" className="form-control" value={row.appointmentDate || inspectionDate} onChange={e => updateCheck(index, { appointmentDate: e.target.value })} /><input type="time" className="form-control" value={row.appointmentTime || ''} onChange={e => updateCheck(index, { appointmentTime: e.target.value })} /></div>)}<button type="button" className="btn btn-secondary" onClick={() => update({ checkAppointments: [...data.checkAppointments, { item: '', expertName: '', appointmentDate: inspectionDate, appointmentTime: '' }] })}>+ 添加其他检查预约</button></section>
  </div>
}
