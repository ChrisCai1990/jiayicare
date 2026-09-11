import React from 'react'

export const isOutpatientStaffAssignmentTask = task => task?.taskRole === 'executor' && /门诊一站式.*执行人员安排/.test(task?.theme || '')
export const emptyOutpatientStaffAssignment = value => ({
  proxyVisitStaffId: value?.proxyVisitStaffId || '',
  proxyVisitStaffName: value?.proxyVisitStaffName || '',
  escortStaffId: value?.escortStaffId || '',
  escortStaffName: value?.escortStaffName || '',
  assignmentNote: value?.assignmentNote || '',
})
export const validateOutpatientStaffAssignment = value => !value?.proxyVisitStaffId
  ? '请选择首次代诊就医专员'
  : !value?.escortStaffId ? '请选择检查日陪诊就医专员' : ''

const bookingSummary = task => task?.dependsOnTaskId?.formData || {}
const scheduleText = row => [row?.appointmentDate, row?.appointmentTime].filter(Boolean).join(' ') || '时间待确认'

export default function OutpatientStaffAssignmentForm({ task, value, onChange, staffList = [] }) {
  const data = emptyOutpatientStaffAssignment(value)
  const booking = bookingSummary(task)
  const assistants = staffList.filter(item => item.role === 'medicalAssistant' && item.staffStatus !== 'inactive')
  const setStaff = (idKey, nameKey, id) => {
    const selected = assistants.find(item => String(item._id) === id)
    onChange({ ...data, [idKey]: id, [nameKey]: selected?.name || '' })
  }
  const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ padding: 13, borderRadius: 10, background: '#F2F8F5', border: '1px solid #B9DDD0' }}><b style={{ color: '#1E6B50' }}>预约已完成，请由健康规划师安排实际执行人员</b><div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>不自动沿用客户档案中的默认就医专员；首次代诊与检查日陪诊可以安排不同人员。</div></div>
    <section style={{ border: '1px solid #E8DCC8', borderRadius: 10, background: '#FFFAF2', padding: 13, display: 'grid', gap: 8 }}>
      <b style={{ color: '#6F5222' }}>健管专员已确认的门诊预约</b>
      <div style={{ fontSize: 13 }}><span style={{ color: '#8A7656' }}>预约医院：</span>{booking.hospital || '未填写'}</div>
      {(booking.prescribingAppointments || []).map((row, index) => <div key={`visit-${index}`} style={{ fontSize: 13 }}><span style={{ color: '#8A7656' }}>首次代诊{index + 1}：</span>{[row.department, row.doctorName].filter(Boolean).join(' · ') || '科室/医生待确认'} · {scheduleText(row)}{row.coveredChecks ? `（拟开：${row.coveredChecks}）` : ''}</div>)}
      {(booking.specialCheckAppointments || []).map((row, index) => <div key={`check-${index}`} style={{ fontSize: 13 }}><span style={{ color: '#8A7656' }}>特殊检查{index + 1}：</span>{[row.item, row.expertName].filter(Boolean).join(' · ') || '检查项目待确认'} · {scheduleText(row)}</div>)}
      {booking.postCheckAppointment && <div style={{ fontSize: 13 }}><span style={{ color: '#8A7656' }}>检查后专家门诊：</span>{[booking.postCheckAppointment.department, booking.postCheckAppointment.expertName].filter(Boolean).join(' · ') || '科室/专家待确认'} · {scheduleText(booking.postCheckAppointment)}</div>}
      {booking.bookingNote && <div style={{ fontSize: 13 }}><span style={{ color: '#8A7656' }}>预约说明：</span>{booking.bookingNote}</div>}
    </section>
    <label style={labelStyle}>首次代诊就医专员 *<select className="form-control" value={data.proxyVisitStaffId} onChange={e => setStaff('proxyVisitStaffId', 'proxyVisitStaffName', e.target.value)}><option value="">请选择</option>{assistants.map(item => <option key={item._id} value={item._id}>{item.name}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label>
    <label style={labelStyle}>检查日陪诊就医专员 *<select className="form-control" value={data.escortStaffId} onChange={e => setStaff('escortStaffId', 'escortStaffName', e.target.value)}><option value="">请选择</option>{assistants.map(item => <option key={item._id} value={item._id}>{item.name}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label>
    <label style={labelStyle}>人员安排说明（选填）<textarea className="form-control" rows={3} value={data.assignmentNote} onChange={e => onChange({ ...data, assignmentNote: e.target.value })} /></label>
  </div>
}
