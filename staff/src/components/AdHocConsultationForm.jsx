import React, { useState } from 'react'
import { staffAPI } from '../api'

const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export default function AdHocConsultationForm({ task }) {
  const source = task?.formData?.planSnapshot || task?.formData || {}
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [requestKey] = useState(() => globalThis.crypto?.randomUUID?.() || `adhoc-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const [form, setForm] = useState({ hospital: source.hospital || '', campus: source.campus || '',
    department: source.department || '', expert: '', reason: '', appointmentDate: localDate(),
    appointmentTime: '', costNotice: '', notes: '', customerConfirmed: false })
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const field = (key, label, type = 'text') => <label style={{ display: 'grid', gap: 4, fontSize: 13 }} key={key}>
    {label}<input className="form-control" type={type} value={form[key]} onChange={event => set(key, event.target.value)} />
  </label>
  const submit = async () => {
    setError(''); setSaving(true)
    try {
      await staffAPI.startAdHocConsultation(task.patientId?._id || task.patientId, {
        ...form, sourceFollowUpId: task._id, requestKey,
      })
      window.location.reload()
    } catch (err) { setError(err.message || '临时加诊发起失败，请重试'); setSaving(false) }
  }
  return <div style={{ border: '1px solid #CFE4DA', borderRadius: 10, padding: 14, background: '#F7FBF9' }}>
    <button type="button" className="btn btn-secondary" onClick={() => setOpen(value => !value)}>
      {open ? '收起临时加诊' : '＋ 现场新增临时加诊'}
    </button>
    {open && <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
      <div style={{ fontSize: 13, color: '#4A6558' }}>客户现场提出、就医专员已安排的专家门诊。此处直接记录实际安排，不再生成事前预约待办；新增服务与本次陪诊关联。</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        {field('hospital', '就诊医院 *')}{field('campus', '院区')}
        {field('department', '科室 *')}{field('expert', '专家 *')}
        {field('appointmentDate', '实际门诊日期 *', 'date')}{field('appointmentTime', '具体时间 *', 'time')}
      </div>
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>客户需求及加诊原因 *
        <textarea className="form-control" rows={3} value={form.reason} onChange={event => set('reason', event.target.value)} />
      </label>
      {field('costNotice', '已向客户告知的门诊费用及支付方式 *')}
      <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>其他交接说明
        <textarea className="form-control" rows={2} value={form.notes} onChange={event => set('notes', event.target.value)} />
      </label>
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={form.customerConfirmed} onChange={event => set('customerConfirmed', event.target.checked)} /> 客户已确认本次临时加诊及费用告知 *</label>
      {error && <div style={{ color: '#B42318', fontSize: 13 }}>{error}</div>}
      <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? '提交中…' : '确认现场加诊并生成执行任务'}</button>
    </div>}
  </div>
}
