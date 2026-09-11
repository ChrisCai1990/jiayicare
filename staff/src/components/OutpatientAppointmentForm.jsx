import React from 'react'

export const isOutpatientAppointmentTask = task => task?.taskRole === 'executor' && /首次代诊门诊预约/.test(task?.theme || '')
const advisorData = task => task?.dependsOnTaskId?.formData || {}

export const emptyOutpatientAppointment = (task, value) => {
  const advice = advisorData(task)
  const requirements = Array.isArray(advice.prescribingVisitRequirements) && advice.prescribingVisitRequirements.length
    ? advice.prescribingVisitRequirements
    : (Array.isArray(advice.expectedChecks) ? advice.expectedChecks.map(item => ({ coveredChecks: item.item, department: item.prescribingDepartment || advice.recommendedDepartment, expertRequired: item.prescribingExpertRequired ?? item.expertRequired, expertName: item.prescribingExpertName || item.expertName })) : [])
  const existing = Array.isArray(value?.prescribingAppointments) ? value.prescribingAppointments : []
  return {
    hospital: value?.hospital || advice.recommendedHospital || '',
    prescribingAppointments: requirements.length ? requirements.map((requirement, index) => ({
      coveredChecks: requirement.coveredChecks || '',
      department: existing[index]?.department || requirement.department || '',
      expertRequired: existing[index]?.expertRequired ?? requirement.expertRequired ?? false,
      expertName: existing[index]?.expertName || requirement.expertName || '',
      appointmentDate: existing[index]?.appointmentDate || value?.appointmentDate || '',
      appointmentTime: existing[index]?.appointmentTime || value?.appointmentTime || '',
      plannedAppointmentDate: requirement.plannedAppointmentDate || '',
      plannedAppointmentTime: requirement.plannedAppointmentTime || '',
      appointmentNumber: existing[index]?.appointmentNumber || value?.appointmentNumber || '',
    })) : existing,
    bookingNote: value?.bookingNote || '',
  }
}

export const validateOutpatientAppointment = value => {
  if (!value?.hospital?.trim()) return '请填写首次代诊开单的医院'
  if (!value?.prescribingAppointments?.length) return '健康顾问尚未填写预计检查及开单要求'
  if (value.prescribingAppointments.some(row => !row.department?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请为每项检查完整安排开单科室及预约日期时间'
  if (value.prescribingAppointments.some(row => row.expertRequired && !row.expertName?.trim())) return '需要专家开单的预约，请填写开单专家姓名'
  return ''
}

export default function OutpatientAppointmentForm({ task, value, onChange }) {
  const advice = advisorData(task)
  const data = emptyOutpatientAppointment(task, value)
  const update = patch => onChange({ ...data, ...patch })
  const updateRow = (index, patch) => update({ prescribingAppointments: data.prescribingAppointments.map((row, i) => i === index ? { ...row, ...patch } : row) })
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #B9DDD0', borderRadius: 10, background: '#F2F8F5', padding: 13 }}>
      <div style={{ color: '#1E6B50', fontSize: 13, fontWeight: 750 }}>健康顾问确定的首次代诊开单要求</div>
      <div style={{ marginTop: 6, fontSize: 13 }}>医院：<b>{advice.recommendedHospital || '—'}</b></div>
      <div style={{ marginTop: 5, fontSize: 12, color: '#65776F' }}>检查完成后拟就诊：{advice.recommendedDepartment || '—'} · {advice.recommendedExpert || '—'}（此处暂不预约，留待检查日专家号环节）</div>
    </div>
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>首次代诊开单医院 *</span><input className="form-control" value={data.hospital} onChange={e => update({ hospital: e.target.value })} /></label>
    <div style={{ fontSize: 13, fontWeight: 750 }}>开检查单门诊预约</div>
    {data.prescribingAppointments.map((row, index) => <div key={`${row.coveredChecks}-${index}`} style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 12, display: 'grid', gap: 9 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{index + 1}. 本次门诊拟开检查：{row.coveredChecks || '未填写项目'}</div>
      <div style={{ fontSize: 12, color: '#65776F' }}>健康顾问建议预约：{row.plannedAppointmentDate || '未填写日期'} {row.plannedAppointmentTime || ''}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
        <label style={{ fontSize: 12, color: '#65776F' }}>开单科室 *<input className="form-control" value={row.department} onChange={e => updateRow(index, { department: e.target.value })} /></label>
        <label style={{ fontSize: 12, color: '#65776F' }}>开单门诊类型<input className="form-control" disabled value={row.expertRequired ? '专家门诊' : '普通门诊'} /></label>
        <label style={{ fontSize: 12, color: '#65776F' }}>开单专家{row.expertRequired ? ' *' : ''}<input className="form-control" disabled={!row.expertRequired} value={row.expertName} onChange={e => updateRow(index, { expertName: e.target.value })} placeholder={row.expertRequired ? '专家姓名' : '无需指定'} /></label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9 }}>
        <label style={{ fontSize: 12, color: '#65776F' }}>预约日期 *<input type="date" className="form-control" value={row.appointmentDate} onChange={e => updateRow(index, { appointmentDate: e.target.value })} /></label>
        <label style={{ fontSize: 12, color: '#65776F' }}>预约时间 *<input type="time" className="form-control" value={row.appointmentTime} onChange={e => updateRow(index, { appointmentTime: e.target.value })} /></label>
        <label style={{ fontSize: 12, color: '#65776F' }}>预约号/凭证（选填）<input className="form-control" value={row.appointmentNumber} onChange={e => updateRow(index, { appointmentNumber: e.target.value })} /></label>
      </div>
    </div>)}
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>代诊预约说明（选填）</span><textarea className="form-control" rows={3} value={data.bookingNote} onChange={e => update({ bookingNote: e.target.value })} placeholder="记录取号方式、代诊注意事项等" /></label>
  </div>
}
