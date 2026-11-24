import React from 'react'

const fixed = ['每日1次', '每周1次', '每周2次']

export default function MonitoringFrequencyField({ label, value = '', onChange }) {
  const customDays = String(value).match(/^每(\d*)天1次$/)?.[1]
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
    <select className="form-input" aria-label={`${label}监测周期`} value={fixed.includes(value) ? value : customDays !== undefined ? 'custom' : ''}
      onChange={event => onChange(event.target.value === 'custom' ? '每3天1次' : event.target.value)} style={{ width: 'auto', minWidth: 118 }}>
      <option value="">选择周期</option>
      {fixed.map(item => <option key={item} value={item}>{item}</option>)}
      <option value="custom">每N天1次</option>
    </select>
    {customDays !== undefined && <input className="form-input" type="number" min="1" max="365" aria-label={`${label}间隔天数`}
      value={customDays} onChange={event => onChange(`每${event.target.value}天1次`)} style={{ width: 76 }} />}
  </span>
}
