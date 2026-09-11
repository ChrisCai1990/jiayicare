import React from 'react'

export const isOutpatientAppointmentTask = task => task?.taskRole === 'executor'
  && /首次代诊门诊预约/.test(task?.theme || '')

const advisorData = task => task?.dependsOnTaskId?.formData || {}

export const emptyOutpatientAppointment = (task, value) => {
  const advice = advisorData(task)
  return {
    hospital: value?.hospital || advice.recommendedHospital || '',
    department: value?.department || advice.recommendedDepartment || '',
    expert: value?.expert || advice.recommendedExpert || '',
    appointmentDate: value?.appointmentDate || '',
    appointmentTime: value?.appointmentTime || '',
    appointmentNumber: value?.appointmentNumber || '',
    bookingNote: value?.bookingNote || '',
  }
}

export const validateOutpatientAppointment = value => {
  if (!value?.hospital?.trim() || !value?.department?.trim() || !value?.expert?.trim() || !value?.appointmentDate || !value?.appointmentTime) {
    return '请完整填写实际预约医院、科室、专家及预约日期时间'
  }
  return ''
}

export default function OutpatientAppointmentForm({ task, value, onChange }) {
  const advice = advisorData(task)
  const data = emptyOutpatientAppointment(task, value)
  const checks = Array.isArray(advice.expectedChecks) ? advice.expectedChecks : []
  const update = patch => onChange({ ...data, ...patch })
  return <div style={{ display: 'grid', gap: 14 }}>
    <div style={{ border: '1px solid #B9DDD0', borderRadius: 10, background: '#F2F8F5', padding: 13 }}>
      <div style={{ color: '#1E6B50', fontSize: 13, fontWeight: 750 }}>健康顾问评估建议</div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, fontSize: 13 }}>
        <div><span style={{ color: '#8AA89C' }}>推荐医院</span><div style={{ marginTop: 3, fontWeight: 650 }}>{advice.recommendedHospital || '—'}</div></div>
        <div><span style={{ color: '#8AA89C' }}>推荐科室</span><div style={{ marginTop: 3, fontWeight: 650 }}>{advice.recommendedDepartment || '—'}</div></div>
        <div><span style={{ color: '#8AA89C' }}>推荐专家</span><div style={{ marginTop: 3, fontWeight: 650 }}>{advice.recommendedExpert || '—'}</div></div>
      </div>
      {checks.length > 0 && <div style={{ marginTop: 10, borderTop: '1px solid #D8E6E0', paddingTop: 9 }}>
        <div style={{ color: '#8AA89C', fontSize: 12 }}>预计检查项目</div>
        {checks.map((item, index) => <div key={index} style={{ marginTop: 5, fontSize: 13 }}>{index + 1}. {item.item}{item.expertRequired ? ` · 检查专家：${item.expertName || '待确定'}` : ' · 无需指定检查专家'}</div>)}
      </div>}
    </div>
    <div style={{ fontSize: 13, fontWeight: 750 }}>实际预约安排</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {[['hospital', '预约医院'], ['department', '预约科室'], ['expert', '预约专家']].map(([key, label]) => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}>
        <span>{label} <b style={{ color: '#DC3545' }}>*</b></span>
        <input className="form-control" value={data[key]} onChange={e => update({ [key]: e.target.value })} />
      </label>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>预约日期 *</span><input type="date" className="form-control" value={data.appointmentDate} onChange={e => update({ appointmentDate: e.target.value })} /></label>
      <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>预约时间 *</span><input type="time" className="form-control" value={data.appointmentTime} onChange={e => update({ appointmentTime: e.target.value })} /></label>
      <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>预约号/凭证（选填）</span><input className="form-control" value={data.appointmentNumber} onChange={e => update({ appointmentNumber: e.target.value })} /></label>
    </div>
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }}><span>预约说明（选填）</span><textarea className="form-control" rows={3} value={data.bookingNote} onChange={e => update({ bookingNote: e.target.value })} placeholder="记录挂号渠道、取号方式、代诊注意事项等" /></label>
  </div>
}
