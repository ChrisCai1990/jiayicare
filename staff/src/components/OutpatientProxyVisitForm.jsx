import React from 'react'

export const isOutpatientProxyVisitTask = task => task?.taskRole === 'executor' && /门诊一站式.*首次代诊开检查单/.test(task?.theme || '')
const bookingFromTask = task => task?.dependsOnTaskId?.formData?.bookingSnapshot || {}
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
const scheduleText = row => [row?.appointmentDate, row?.appointmentTime].filter(Boolean).join(' ') || '时间待确认'
const inspectionDateFrom = booking => booking?.specialCheckAppointments?.find(row => row.appointmentDate)?.appointmentDate || booking?.postCheckAppointment?.appointmentDate || ''

export const emptyOutpatientProxyVisit = (task, value) => {
  const saved = value || {}
  const booking = saved.bookingSnapshot || bookingFromTask(task)
  const suggested = (booking.specialCheckAppointments || []).map(row => ({ item: row.item || '', department: row.department || '', expertName: row.expertName || '', location: row.location || row.floor || '', appointmentDate: row.appointmentDate || '', appointmentTime: row.appointmentTime || '' }))
  return { proxyVisitCompleted: !!saved.proxyVisitCompleted, proxyVisitResult: saved.proxyVisitResult || '', examOrderSummary: saved.examOrderSummary || '', checkAppointments: saved.checkAppointments?.length ? saved.checkAppointments : suggested, bookingSnapshot: booking }
}

export const validateOutpatientProxyVisit = value => {
  if (!value?.proxyVisitCompleted) return '请确认已完成首次代诊'
  if (!value?.proxyVisitResult?.trim()) return '请填写专家诊疗意见及医嘱'
  if (!value?.examOrderSummary?.trim()) return '请填写本次代诊实际开具的检验检查单/项目'
  if (!value?.checkAppointments?.length) return '请填写检查预约安排'
  if (value.checkAppointments.some(row => !row.item?.trim() || !row.department?.trim() || !row.location?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请完整填写每项检验检查的项目、科室、楼栋楼层/具体地点、日期和时间'
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
    <section style={{ border: '1px solid #B9DDD0', borderRadius: 10, padding: 16, display: 'grid', gap: 14 }}><b>检验检查预约安排（含新增检查单）</b><div style={{ fontSize: 12, color: '#65776F' }}>逐项核对项目、执行科室、具体地点和时间；检查专家没有指定时可不填。</div>{data.checkAppointments.map((row, index) => <div key={index} style={{ padding: 14, border: '1px solid #D9E5DF', borderRadius: 10, background: '#FAFCFB', display: 'grid', gap: 12 }}><b style={{ color: '#1E6B50' }}>第 {index + 1} 项检验检查</b><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}><label style={labelStyle}>检验检查项目 *<input className="form-control" value={row.item || ''} onChange={e => updateCheck(index, { item: e.target.value })} placeholder="如：甲状腺超声" /></label><label style={labelStyle}>执行科室 *<input className="form-control" value={row.department || ''} onChange={e => updateCheck(index, { department: e.target.value })} placeholder="如：超声医学科" /></label><label style={labelStyle}>检查专家（选填）<input className="form-control" value={row.expertName || ''} onChange={e => updateCheck(index, { expertName: e.target.value })} placeholder="有指定专家时填写" /></label><label style={labelStyle}>楼栋、楼层或具体地点 *<input className="form-control" value={row.location || ''} onChange={e => updateCheck(index, { location: e.target.value })} placeholder="如：门诊楼3层超声中心" /></label><label style={labelStyle}>检查日期 *<input type="date" className="form-control" value={row.appointmentDate || inspectionDate} onChange={e => updateCheck(index, { appointmentDate: e.target.value })} /></label><label style={labelStyle}>检查时间 *<input type="time" className="form-control" value={row.appointmentTime || ''} onChange={e => updateCheck(index, { appointmentTime: e.target.value })} /></label></div></div>)}<button type="button" className="btn btn-secondary" onClick={() => update({ checkAppointments: [...data.checkAppointments, { item: '', department: '', expertName: '', location: '', appointmentDate: inspectionDate, appointmentTime: '' }] })}>+ 添加其他检验检查预约</button></section>
  </div>
}
