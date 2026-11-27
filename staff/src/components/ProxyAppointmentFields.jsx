import React from 'react'
import DateField from '../../../shared/DateField.jsx'

const appointmentFields = [['hospital', '医院'], ['department', '科室/检查项目'], ['expert', '专家/医生'], ['campus', '院区'], ['appointmentDate', '预约日期'], ['appointmentTime', '预约时间']]

export default function ProxyAppointmentFields({ row, fields = appointmentFields, onChange }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{fields.map(([key, title]) => <label key={key} style={{ display: 'grid', gap: 4, fontSize: 12 }}>{title}<DateField className="form-control" type={key === 'appointmentDate' ? 'date' : key === 'appointmentTime' ? 'time' : 'text'} value={row[key] || ''} onChange={e => onChange(key, e.target.value)} /></label>)}</div>
}
