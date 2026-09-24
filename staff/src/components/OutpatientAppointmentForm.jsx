import React from 'react'

export const isOutpatientAppointmentTask = task => task?.taskRole === 'executor' && /(?:代诊约诊服务|首次代诊门诊预约)/.test(task?.theme || '')
const advisorData = task => task?.dependsOnTaskId?.formData || {}
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

export const emptyOutpatientAppointment = (task, value) => {
  const advice = advisorData(task)
  const requirements = Array.isArray(advice.prescribingVisitRequirements) ? advice.prescribingVisitRequirements : []
  const checks = Array.isArray(advice.expectedChecks) ? advice.expectedChecks : []
  const existing = Array.isArray(value?.prescribingAppointments) ? value.prescribingAppointments : []
  const specialExisting = Array.isArray(value?.specialCheckAppointments) ? value.specialCheckAppointments : []
  return {
    hospital: value?.hospital || advice.recommendedHospital || '',
    campus: value?.campus || '',
    prescribingAppointments: [...requirements.map((row, index) => ({ coveredChecks: existing[index]?.coveredChecks || row.coveredChecks || '', department: existing[index]?.department || row.department || '', doctorName: existing[index]?.doctorName || row.expertName || '', appointmentDate: existing[index]?.appointmentDate || '', appointmentTime: existing[index]?.appointmentTime || '', communicationContent: existing[index]?.communicationContent || row.communicationContent || '' })), ...existing.slice(requirements.length)],
    specialCheckAppointments: [...checks.map((row, index) => ({ item: specialExisting[index]?.item || row.item || '', expertRequired: specialExisting[index]?.expertRequired ?? !!row.expertRequired, expertName: specialExisting[index]?.expertName || row.expertName || '', appointmentDate: specialExisting[index]?.appointmentDate || '', appointmentTime: specialExisting[index]?.appointmentTime || '' })), ...specialExisting.slice(checks.length)],
    postCheckAppointments: Array.isArray(value?.postCheckAppointments) ? value.postCheckAppointments : [{ department: value?.postCheckAppointment?.department || advice.recommendedDepartment || '', expertName: value?.postCheckAppointment?.expertName || advice.recommendedExpert || '', appointmentDate: value?.postCheckAppointment?.appointmentDate || '', appointmentTime: value?.postCheckAppointment?.appointmentTime || '' }],
    bookingNote: value?.bookingNote || '',
  }
}

export const validateOutpatientAppointment = value => {
  if (!value?.hospital?.trim()) return '请填写预约医院'
  if (!value?.campus?.trim()) return '请填写预约院区'
  if (!value?.prescribingAppointments?.length) return '健康顾问尚未填写开检查单建议'
  if (value.prescribingAppointments.some(row => !row.coveredChecks?.trim() || !row.department?.trim() || !row.doctorName?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请逐项确认开单项目、科室、医生及预约时间'
  if (value.specialCheckAppointments?.some(row => !row.item?.trim() || !row.appointmentDate || !row.appointmentTime || (row.expertRequired && !row.expertName?.trim()))) return '请逐项填写特殊检查项目、预约时间及所需专家'
  if (!value.postCheckAppointments?.length || value.postCheckAppointments.some(post => !post.department?.trim() || !post.expertName?.trim() || !post.appointmentDate || !post.appointmentTime)) return '请逐项安排检查后的专家门诊'
  return ''
}

export default function OutpatientAppointmentForm({ task, value, onChange }) {
  const data = emptyOutpatientAppointment(task, value)
  const advice = advisorData(task)
  const requirements = Array.isArray(advice.prescribingVisitRequirements) ? advice.prescribingVisitRequirements : []
  const checks = Array.isArray(advice.expectedChecks) ? advice.expectedChecks : []
  const update = patch => onChange({ ...data, ...patch })
  const updateRow = (key, index, patch) => update({ [key]: data[key].map((row, i) => i === index ? { ...row, ...patch } : row) })
  const addRow = (key, row) => update({ [key]: [...data[key], row] })
  const removeRow = (key, index, minimum = 0) => { if (data[key].length > minimum) update({ [key]: data[key].filter((_, i) => i !== index) }) }
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #B9DDD0', borderRadius: 10, background: '#F2F8F5', padding: 13 }}><b style={{ color: '#1E6B50' }}>健康顾问建议已带入，请由健管专员确认实际预约</b></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={labelStyle}>预约医院 *<input className="form-control" value={data.hospital} onChange={e => update({ hospital: e.target.value })} /></label><label style={labelStyle}>院区 *<input className="form-control" value={data.campus} onChange={e => update({ campus: e.target.value })} placeholder="如：庆春院区" /></label></div>
    <section style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><b>第一步：确认开检查单门诊预约</b>
      {data.prescribingAppointments.map((row, index) => <div key={index} style={{ display: 'grid', gap: 8, borderTop: index ? '1px solid #E0E8E3' : 0, paddingTop: index ? 10 : 0 }}>
        <label style={labelStyle}>拟开项目 *<input className="form-control" value={row.coveredChecks} onChange={e => updateRow('prescribingAppointments', index, { coveredChecks: e.target.value })} /></label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          <label style={labelStyle}>确认科室 *<input className="form-control" value={row.department} onChange={e => updateRow('prescribingAppointments', index, { department: e.target.value })} /></label>
          <label style={labelStyle}>确认医生 *<input className="form-control" value={row.doctorName} onChange={e => updateRow('prescribingAppointments', index, { doctorName: e.target.value })} /></label>
          <label style={labelStyle}>预约日期 *<input type="date" className="form-control" value={row.appointmentDate} onChange={e => updateRow('prescribingAppointments', index, { appointmentDate: e.target.value })} /></label>
          <label style={labelStyle}>预约时间 *<input type="time" className="form-control" value={row.appointmentTime} onChange={e => updateRow('prescribingAppointments', index, { appointmentTime: e.target.value })} /></label>
        </div><label style={labelStyle}>实际沟通内容（自行记录）<textarea className="form-control" rows={2} value={row.communicationContent} onChange={e => updateRow('prescribingAppointments', index, { communicationContent: e.target.value })} /></label>{index >= requirements.length && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow('prescribingAppointments', index, 1)}>移除额外开单预约</button>}
      </div>)}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRow('prescribingAppointments', { coveredChecks: '', department: '', doctorName: '', appointmentDate: '', appointmentTime: '', communicationContent: '' })}>＋ 新增开单预约</button>
    </section>
    <section style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><b>第二步：沟通并确认特殊检查专家的具体时间</b>
      {data.specialCheckAppointments.map((row, index) => <div key={index} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: 8 }}>
        <label style={labelStyle}>特殊检查项目 *<input className="form-control" disabled={index < checks.length} value={row.item} onChange={e => updateRow('specialCheckAppointments', index, { item: e.target.value })} /></label><label style={labelStyle}>检查专家{row.expertRequired ? ' *' : '（选填）'}<input className="form-control" value={row.expertName} onChange={e => updateRow('specialCheckAppointments', index, { expertName: e.target.value })} placeholder={row.expertRequired ? '确认专家' : '如需指定请填写'} /></label>
        <label style={labelStyle}>检查日期 *<input type="date" className="form-control" value={row.appointmentDate} onChange={e => updateRow('specialCheckAppointments', index, { appointmentDate: e.target.value })} /></label><label style={labelStyle}>检查时间 *<input type="time" className="form-control" value={row.appointmentTime} onChange={e => updateRow('specialCheckAppointments', index, { appointmentTime: e.target.value })} /></label>
      </div>)}
      {data.specialCheckAppointments.map((row, index) => index >= checks.length && <button type="button" key={`remove-special-${index}`} className="btn btn-secondary btn-sm" onClick={() => removeRow('specialCheckAppointments', index)}>移除特殊检查{index + 1}</button>)}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRow('specialCheckAppointments', { item: '', expertRequired: false, expertName: '', appointmentDate: '', appointmentTime: '' })}>＋ 新增特殊检查预约</button>
    </section>
    <section style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}><b>第三步：根据检查时间安排检查后的专家门诊</b>
      {data.postCheckAppointments.map((row, index) => <div key={index} style={{ display: 'grid', gap: 8, borderTop: index ? '1px solid #E0E8E3' : 0, paddingTop: index ? 10 : 0 }}><b>专家门诊 {index + 1}</b><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {[['department', '看诊科室'], ['expertName', '看诊专家']].map(([key, label]) => <label key={key} style={labelStyle}>{label} *<input className="form-control" value={row[key]} onChange={e => updateRow('postCheckAppointments', index, { [key]: e.target.value })} /></label>)}
        <label style={labelStyle}>看诊日期 *<input type="date" className="form-control" value={row.appointmentDate} onChange={e => updateRow('postCheckAppointments', index, { appointmentDate: e.target.value })} /></label><label style={labelStyle}>看诊时间 *<input type="time" className="form-control" value={row.appointmentTime} onChange={e => updateRow('postCheckAppointments', index, { appointmentTime: e.target.value })} /></label>
      </div>{data.postCheckAppointments.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => removeRow('postCheckAppointments', index, 1)}>移除这次专家门诊</button>}</div>)}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRow('postCheckAppointments', { department: '', expertName: '', appointmentDate: '', appointmentTime: '' })}>＋ 新增检查后专家门诊</button>
    </section>
    <label style={labelStyle}>预约补充说明（选填）<textarea className="form-control" rows={3} value={data.bookingNote} onChange={e => update({ bookingNote: e.target.value })} /></label>
  </div>
}
