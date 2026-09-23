import React, { useState } from 'react'
import { staffAPI } from '../api'
import itemTools from '../../../shared/annualServiceItem.cjs'

export default function AnnualBookingCard({ task, staff, onLinked }) {
  const [date, setDate] = useState(''), [hospital, setHospital] = useState(''), [department, setDepartment] = useState(''), [note, setNote] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!itemTools.isAssistance(task)) return null
  const booked = task.annualBooking
  const canEdit = staff?.role === 'superadmin' || (staff?.role === 'healthManager' && String(task.assignedTo?._id || task.assignedTo) === String(staff._id))
  return <section style={{ border: '1px solid #B2D8C7', padding: 16, marginBottom: 16, borderRadius: 8 }}>
    <b>就医协助 · 预约安排</b>
    <h4>健康顾问原计划（只读）</h4>
    <p style={{ whiteSpace: 'pre-wrap' }}>{task.plannedContent || task.content}</p>
    {booked?.status === 'booked' ? <p>预约已确认：{booked.date} · {booked.hospital} · {booked.department}<br />{booked.note}<br />待健康规划师安排服务；原随访继续保留。</p> : canEdit && itemTools.needsBooking(task) ? <>
      <label>实际预约日期<input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>预约医院<input className="form-input" maxLength={200} value={hospital} onChange={e => setHospital(e.target.value)} /></label>
      <label>预约科室<input className="form-input" maxLength={200} value={department} onChange={e => setDepartment(e.target.value)} /></label>
      <label>预约时段／专家／备注<textarea className="form-input" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <p>登记实际预约结果，不修改顾问原计划，不结束随访。</p>
      <button className="btn btn-primary" disabled={busy || !date || !hospital.trim() || !department.trim()} onClick={async () => {
        setBusy(true); setError('')
        try { const res = await staffAPI.confirmAnnualBooking(task._id, { date, hospital, department, note }); onLinked(res.data) }
        catch (e) { setError(e.message) } finally { setBusy(false) }
      }}>确认预约完成</button>
    </> : <p>等待本事项健管专员处理预约。</p>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
