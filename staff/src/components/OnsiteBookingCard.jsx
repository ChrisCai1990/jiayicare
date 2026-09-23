import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { BookingSummary } from './AnnualBookingCard'

export default function OnsiteBookingCard({ task, staff }) {
  const [rows, setRows] = useState([]), [error, setError] = useState(''), [forms, setForms] = useState({}), [busy, setBusy] = useState(false)
  const eligible = !!(task.sourceOrderId || task.sourceHealthPlanId) && (staff?.role === 'superadmin' || String(task.assignedTo?._id || task.assignedTo) === String(staff?._id))
  const canWrite = ['medicalAssistant', 'superadmin'].includes(staff?.role) && task.taskRole === 'executor' && !task.isBlocked && ['planned', 'in_progress', 'missed', 'completed'].includes(task.status)
  useEffect(() => {
    let active = true
    if (eligible) staffAPI.getOnsiteBookings(task._id).then(r => { if (active) setRows(r.data || []) }).catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [task._id, eligible])
  if (!eligible || (!rows.length && !error)) return null
  return <section style={{ background: '#F6FBF8', padding: 16, borderRadius: 10, marginBottom: 16 }}>
    <h3>顾问预约要求与交接记录</h3>
    {rows.map(p => <div key={p.id}><BookingSummary booking={p.booking} />
      {canWrite && p.booking.entries.filter(e => e.mode === 'onsite' && e.status === 'pending').map(e => {
        const key = `${p.id}:${e.id}`, form = forms[key] || {}
        const change = (field, value) => setForms(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
        return <div key={e.id} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          <b>登记现场预约结果 · {e.title}</b>
          {!e.department && <p>顾问尚未明确检查科室，请先核对顾问要求，不可自行决定科室。</p>}
          {!e.hospital && <label>实际预约医院<input className="form-input" value={form.hospital || ''} onChange={ev => change('hospital', ev.target.value)} /></label>}
          <label>检查日期<input className="form-input" type="date" value={form.date || ''} onChange={ev => change('date', ev.target.value)} /></label>
          <label>具体时间<input className="form-input" type="time" value={form.time || ''} onChange={ev => change('time', ev.target.value)} /></label>
          <label>现场结果备注<textarea className="form-input" value={form.note || ''} maxLength={2000} onChange={ev => change('note', ev.target.value)} /></label>
          <button type="button" className="btn btn-primary" disabled={busy || !form.date || !form.time || !e.department || !(e.hospital || form.hospital)} onClick={async () => {
            setBusy(true); setError('')
            try { await staffAPI.saveOnsiteBooking(task._id, { ...form, parentId: p.id, entryId: e.id }); const res = await staffAPI.getOnsiteBookings(task._id); setRows(res.data || []) }
            catch (err) { setError(err.message) } finally { setBusy(false) }
          }}>保存现场预约结果</button>
        </div>
      })}
    </div>)}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
