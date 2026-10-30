import React from 'react'

export function isStaffMonitoringFollowUp(task) {
  return task?.clientVisible === false && task?.repeatWeekly === true && !!task?.weeklyTemplate
    && task?.checkInItems?.length === 1
    && ['bloodPressure', 'weight'].includes(task.checkInItems[0])
}

export function initialMonitoringMeasurement() {
  const now = new Date()
  return { recordedAt: new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    sys: '', dia: '', weight: '', note: '' }
}

export function monitoringSubmission(task, form) {
  const measurement = form.monitoring || {}
  const date = new Date(measurement.recordedAt)
  if (!Number.isFinite(date.getTime())) throw new Error('请填写实际测量时间')
  const content = String(form.content || '').trim()
  if (!content) throw new Error('请填写本次人工跟进结果')
  const data = { recordedAt: date.toISOString(), note: String(measurement.note || '').trim(),
    content, followUpType: form.type }
  if (task.checkInItems[0] === 'bloodPressure') {
    const sys = Number(measurement.sys); const dia = Number(measurement.dia)
    if (!(sys > dia && dia > 0)) throw new Error('请填写有效的收缩压和舒张压')
    return { ...data, sys, dia }
  }
  const weight = Number(measurement.weight)
  if (!(weight > 0)) throw new Error('请填写大于0的体重（kg）')
  return { ...data, weight }
}

export default function MonitoringFollowUpFields({ task, value, onChange }) {
  if (!isStaffMonitoringFollowUp(task)) return null
  const data = value || {}
  const set = (key, next) => onChange({ ...data, [key]: next })
  const bloodPressure = task.checkInItems[0] === 'bloodPressure'
  return <div style={{ border: '1px solid #B8D8C7', borderRadius: 9, background: '#F4FAF6', padding: 12, display: 'grid', gap: 9 }}>
    <strong style={{ color: '#1E6B50', fontSize: 14 }}>本次实际测量数据</strong>
    <div style={{ fontSize: 12, color: '#5F6B65' }}>保存后直接写入客户健康档案；完成本次内部随访，并从测量日期顺延7天生成下一次。</div>
    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>实际测量时间
      <input className="form-control" type="datetime-local" value={data.recordedAt || ''} onChange={e => set('recordedAt', e.target.value)} />
    </label>
    {bloodPressure ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>收缩压（mmHg）
        <input className="form-control" type="number" min="1" value={data.sys || ''} onChange={e => set('sys', e.target.value)} />
      </label>
      <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>舒张压（mmHg）
        <input className="form-control" type="number" min="1" value={data.dia || ''} onChange={e => set('dia', e.target.value)} />
      </label>
    </div> : <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>体重（kg）
      <input className="form-control" type="number" min="0.1" step="0.1" value={data.weight || ''} onChange={e => set('weight', e.target.value)} />
    </label>}
    <label style={{ display: 'grid', gap: 4, fontSize: 12 }}>测量备注（可选）
      <input className="form-control" value={data.note || ''} onChange={e => set('note', e.target.value)} placeholder="如测量条件、客户反馈" />
    </label>
  </div>
}
