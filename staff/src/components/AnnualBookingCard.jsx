import React, { useState } from 'react'
import { staffAPI } from '../api'
import itemTools from '../../../shared/annualServiceItem.cjs'
import planTools from '../../../shared/annualBookingPlan.cjs'
import CareFlowCard from './CareFlowCard'

export function BookingSummary({ booking }) {
  if (!booking) return null
  if (!booking.entries) return <p>{booking.date} {booking.time} · {booking.hospital} · {booking.department} · {booking.expert || '未指定专家'} {booking.note}</p>
  return <div>{booking.entries.map(e => <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #E0D9CE' }}>
    <b>{e.type === 'exam' ? '检查' : '门诊'} · {e.title}</b>
    <div>{e.hospital || '医院待确认'} · {e.department || '科室待顾问确认'} · {e.expert || '未指定专家'}</div>
    <div>{e.status === 'booked' ? `已预约：${e.date} ${e.time}` : e.mode === 'onsite' ? '待就医专员现场预约（未完成）' : '无需预约'}</div>
    {e.note && <div>交接说明：{e.note}</div>}
    {e.onsiteResult?.note && <div>现场结果：{e.onsiteResult.note}</div>}
  </div>)}</div>
}

export default function AnnualBookingCard({ task, staff, onLinked }) {
  const slots = planTools.bookingSlots(task)
  const [entries, setEntries] = useState(() => slots.map(s => ({ id: s.id, mode: 'prebook', date: '', time: '', hospital: '', note: '' })))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [fullFlow,setFullFlow] = useState(false)
  if(task.careFlowId || fullFlow) return <CareFlowCard task={task} staff={staff} onCompleted={()=>onLinked?.(null)}/>
  if (!itemTools.isAssistance(task)) return null
  const plan = planTools.bookingPlan(task), booked = task.annualBooking
  const canEdit = staff?.role === 'superadmin' || (staff?.role === 'healthManager' && String(task.assignedTo?._id || task.assignedTo) === String(staff._id))
  const change = (id, key, value) => setEntries(prev => prev.map(e => e.id === id ? { ...e, [key]: value } : e))
  const valid = entries.every((e, i) => e.mode === 'prebook' ? e.date && e.time && slots[i].department && (slots[i].hospital || e.hospital.trim()) : e.note.trim() && (e.mode !== 'onsite' || slots[i].department))
  return <section style={{ fontSize: 14, lineHeight: 1.6 }}>
    {task.deliveryMode==='single' && canEdit && <button className="btn btn-primary" onClick={()=>setFullFlow(true)}>进入完整流程 / 回退顾问修订</button>}
    <h3>顾问预约要求（只读）</h3>
    <p>建议日期：{plan.suggestedDate || '待确认'}{plan.precautions && ` · ${plan.precautions}`}</p>
    <details style={{ margin: '12px 0', color: '#65776F' }}><summary>查看顾问完整依据与原计划</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>{plan.text}</div></details>
    {planTools.bookingReady(booked) ? <><b>预约安排已确认</b><BookingSummary booking={booked} /><p>现场预约仍待执行；预约安排不代表就医或检查完成。</p></> : canEdit && itemTools.needsBooking(task) ? <div style={{ display: 'grid', gap: 16 }}>
      {slots.map((s, i) => { const e = entries[i]; return <section key={s.id} style={{ background: '#F6FBF8', padding: 16, border: '1px solid #DCE9E2', borderRadius: 10, display: 'grid', gap: 10 }}>
        <b>{s.type === 'exam' ? '检查预约' : '门诊预约'} · {s.title}</b>
        <div>医院：{s.hospital || '未指定'}<br />{s.type === 'exam' ? '检查科室' : '就医/开单科室'}：{s.department || '待顾问确认'}<br />{s.type === 'exam' ? '检查专家' : '门诊专家'}：{s.expert || '未指定专家'}</div>
        {!s.department && <small style={{ color: '#B45309' }}>预约前需由顾问明确科室，现场办理也不能跳过。</small>}
        <label>办理方式<select className="form-input" value={e.mode} onChange={ev => change(s.id, 'mode', ev.target.value)}>
          <option value="prebook">健管专员提前预约</option>
          {s.type === 'exam' && <option value="onsite">就医专员现场预约</option>}
          <option value="not_required">无需预约（须填写依据）</option>
        </select></label>
        {e.mode === 'prebook' && <>
          {!s.department && <p role="alert" style={{ color: '#B45309' }}>顾问尚未明确科室，请先由健康顾问补充；健管专员不代定科室。</p>}
          {!s.hospital && <label>实际预约医院（顾问未指定）<input className="form-input" maxLength={200} value={e.hospital} onChange={ev => change(s.id, 'hospital', ev.target.value)} /></label>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <label>实际预约日期<input className="form-input" type="date" value={e.date} onChange={ev => change(s.id, 'date', ev.target.value)} /></label>
            <label>具体时间<input className="form-input" type="time" value={e.time} onChange={ev => change(s.id, 'time', ev.target.value)} /></label>
          </div>
        </>}
        <label>{e.mode === 'onsite' ? '现场预约前置条件及交接要求（必填，如先开单、缴费，再预约）' : e.mode === 'not_required' ? '无需预约的确认依据（必填）' : '预约备注（选填）'}<textarea className="form-input" rows={2} maxLength={2000} value={e.note} onChange={ev => change(s.id, 'note', ev.target.value)} /></label>
      </section> })}
      <button className="btn btn-primary" disabled={busy || !valid} onClick={async () => {
        setBusy(true); setError('')
        try { const res = await staffAPI.confirmAnnualBooking(task._id, { entries: entries.map((e, i) => ({ ...e, hospital: slots[i].hospital || e.hospital })) }); onLinked(res.data) }
        catch (e) { setError(e.message) } finally { setBusy(false) }
      }}>{busy ? '保存中…' : '确认预约安排，提交派单'}</button>
      <small>顾问要求不变；预约结果与现场待办分开留存，交健康规划师安排服务。</small>
    </div> : <p>等待本事项健管专员处理预约。</p>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
