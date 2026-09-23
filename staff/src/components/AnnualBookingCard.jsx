import React, { useState } from 'react'
import { staffAPI } from '../api'
import itemTools from '../../../shared/annualServiceItem.cjs'
import planTools from '../../../shared/annualBookingPlan.cjs'

export default function AnnualBookingCard({ task, staff, onLinked }) {
  const [date, setDate] = useState(''), [time, setTime] = useState(''), [hospital, setHospital] = useState(''), [note, setNote] = useState('')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  if (!itemTools.isAssistance(task)) return null
  const booked = task.annualBooking
  const plan = planTools.bookingPlan(task)
  const row = (label, value) => <div key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12, padding: '7px 0', borderBottom: '1px solid #EDF1EE' }}><span style={{ color: '#65776F' }}>{label}</span><span style={{ overflowWrap: 'anywhere' }}>{value || '未指定'}</span></div>
  const canEdit = staff?.role === 'superadmin' || (staff?.role === 'healthManager' && String(task.assignedTo?._id || task.assignedTo) === String(staff._id))
  return <section style={{ fontSize: 14, lineHeight: 1.6 }}>
    <h3 style={{ margin: '0 0 12px' }}>顾问预约要求（只读）</h3>
    <div style={{ background: '#F6FBF8', padding: '10px 16px', borderRadius: 10 }}>
      {row('项目', plan.items)}{row('医院', plan.hospital)}{row('科室', plan.department)}{row('专家', plan.expert || '未指定专家')}
      {plan.orderDepartment && row('开单科室', plan.orderDepartment)}{row('建议日期', plan.suggestedDate)}
      {plan.precautions && row('注意事项', plan.precautions)}
    </div>
    <details style={{ margin: '12px 0', color: '#65776F' }}><summary>查看顾问完整依据与原计划</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{plan.text}</div></details>
    {booked?.status === 'booked' ? <div style={{ background: '#E8F5EF', padding: 16, borderRadius: 10 }}><b>预约已完成，待健康规划师安排</b>{row('实际日期', `${booked.date} ${booked.time || ''}`)}{row('预约医院', booked.hospital)}{row('科室', booked.department)}{row('专家', booked.expert || '未指定专家')}{booked.note && row('备注', booked.note)}<small>原随访继续保留，预约完成不代表检查完成。</small></div> : canEdit && itemTools.needsBooking(task) ? <div style={{ display: 'grid', gap: 14 }}>
      <h3 style={{ margin: 0 }}>填写预约结果</h3>
      {!plan.department && <p role="alert" style={{ color: '#B45309', margin: 0 }}>顾问尚未明确科室，请先由健康顾问补充；健管专员不代定科室。</p>}
      {!plan.hospital && <label>实际预约医院（顾问未指定）<input className="form-input" maxLength={200} value={hospital} onChange={e => setHospital(e.target.value)} /></label>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
        <label>实际预约日期<input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <label>具体时间<input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      </div>
      <label>预约备注（选填）<textarea className="form-input" rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy || !date || !time || !(plan.hospital || hospital.trim()) || !plan.department} onClick={async () => {
        setBusy(true); setError('')
        try { const res = await staffAPI.confirmAnnualBooking(task._id, { date, time, ...(!plan.hospital ? { hospital } : {}), note }); onLinked(res.data) }
        catch (e) { setError(e.message) } finally { setBusy(false) }
      }}>{busy ? '保存中…' : '确认预约完成，交健康规划师'}</button>
      <small style={{ color: '#65776F' }}>按顾问要求执行；变更医院、科室或专家请先联系健康顾问。</small>
    </div> : <p>等待本事项健管专员处理预约。</p>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
