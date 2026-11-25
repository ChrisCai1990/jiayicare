import DateField from '../../../shared/DateField.jsx'
import React, { useState } from 'react'
import { staffAPI } from '../api'
import itemTools from '../../../shared/annualServiceItem.cjs'
import planTools from '../../../shared/annualBookingPlan.cjs'
import { bookingRequirements } from '../../../shared/annualBookingDisplay.cjs'
import CareFlowCard from './CareFlowCard'

export function BookingSummary({ booking }) {
  if (!booking) return null
  if (!booking.entries) return <p>{booking.date} {booking.time} · {booking.hospital} · {booking.department} · {booking.expert || '未指定专家'} {booking.note}</p>
  return <div>{booking.entries.map(e => <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid #E0D9CE' }}>
    <b>{e.type === 'exam' ? '检查' : '门诊'} · {e.title}</b>
    <div>{e.hospital || '医院待确认'}{e.campus ? ` · ${e.campus}` : ''} · {e.department || '科室待顾问确认'} · {e.expert || '未指定专家'}</div>
    <div>{e.status === 'booked' ? `已预约：${e.date} ${e.time}` : e.mode === 'onsite' ? '待就医专员现场预约（未完成）' : '无需预约'}</div>
    {e.note && <div>交接说明：{e.note}</div>}
    {e.onsiteResult?.note && <div>现场结果：{e.onsiteResult.note}</div>}
  </div>)}</div>
}

export default function AnnualBookingCard({ task, staff, onLinked }) {
  const slots = planTools.bookingSlots(task)
  const [entries, setEntries] = useState(() => slots.map(s => ({ id: s.id, mode: 'prebook', date: '', time: '', hospital: '', bookedExpertId: '', note: '' })))
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [fullFlow,setFullFlow] = useState(false)
  if(task.careFlowId || fullFlow) return <CareFlowCard task={task} staff={staff} onCompleted={()=>onLinked?.(null)}/>
  if (!itemTools.isAssistance(task)) return null
  const requirements = bookingRequirements(task), plan = requirements.plan, booked = task.annualBooking
  const canEdit = staff?.role === 'superadmin' || (staff?.role === 'healthManager' && String(task.assignedTo?._id || task.assignedTo) === String(staff._id))
  const change = (id, key, value) => setEntries(prev => prev.map(e => e.id === id ? { ...e, [key]: value } : e))
  const valid = entries.every((e, i) => e.mode === 'prebook' ? e.date && e.time && slots[i].department && (slots[i].hospital || e.hospital.trim()) && (!slots[i].candidates?.length || e.bookedExpertId) : e.note.trim() && (e.mode !== 'onsite' || slots[i].department))
  return <section style={{ fontSize: 14, lineHeight: 1.6 }}>
    {task.deliveryMode==='single' && canEdit && <button className="btn btn-primary" onClick={()=>setFullFlow(true)}>进入完整流程 / 回退顾问修订</button>}
    <div style={{ border: '1px solid #CDE3D8', borderRadius: 12, padding: 16, background: '#F7FBF8', display: 'grid', gap: 14 }}>
      <div><h3 style={{ margin: '0 0 4px' }}>顾问预约要求 <small style={{ fontWeight: 400, color: '#65776F' }}>只读</small></h3><div style={{ color: '#65776F' }}>请按以下原计划逐项核对预约信息。</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        {[['就诊医院', plan.hospital || '待顾问明确'], ['预约安排日期', requirements.appointmentDate || '待确认'], ['建议就医日期', plan.suggestedDate || '待确认']].map(([label, value]) => <div key={label} style={{ background: '#FFF', border: '1px solid #E1EAE4', borderRadius: 8, padding: '9px 12px' }}><div style={{ fontSize: 12, color: '#65776F' }}>{label}</div><strong style={{ color: '#1A2B24', overflowWrap: 'anywhere' }}>{value}</strong></div>)}
      </div>
      {requirements.visitItems.length ? <div style={{ display: 'grid', gap: 10 }}><b>同次就诊事项 · {requirements.visitItems.length} 项</b>{requirements.visitItems.map((item, index) => <div key={`${item.title}-${index}`} style={{ background: '#FFF', border: '1px solid #DCE8E2', borderRadius: 9, padding: '11px 14px', display: 'grid', gap: 6 }}><strong>{index + 1}. {item.title}</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8 }}><div><span style={{ color: '#65776F' }}>科室　</span>{item.department || '待顾问明确'}</div><div><span style={{ color: '#65776F' }}>专家　</span>{item.expert || '未指定'}</div></div>{item.reason && <div><span style={{ color: '#65776F' }}>就医原因　</span>{item.reason}</div>}</div>)}</div> : <div style={{ display: 'grid', gap: 6 }}><b>本次事项 · {plan.items || task.theme || '待确认'}</b><div>科室：{plan.department || '待顾问明确'}　专家：{plan.expert || '未指定'}</div>{plan.reason && <div>就医原因：{plan.reason}</div>}</div>}
      {(requirements.goal || requirements.precautions || requirements.frequency) && <div style={{ display: 'grid', gap: 5, borderTop: '1px solid #DCE8E2', paddingTop: 12 }}>{requirements.goal && <div><b>管理目标：</b>{requirements.goal}</div>}{requirements.precautions && <div><b>注意事项：</b>{requirements.precautions}</div>}{requirements.frequency && <div><b>执行频次：</b>{requirements.frequency}</div>}</div>}
      <details style={{ color: '#4A6558' }}><summary style={{ cursor: 'pointer' }}>查看顾问完整依据与原计划</summary><div style={{ whiteSpace: 'pre-wrap', marginTop: 10, padding: 12, background: '#FFF', borderRadius: 8, overflowWrap: 'anywhere' }}>{plan.text}</div></details>
    </div>
    {planTools.bookingReady(booked) ? <><b>预约安排已确认</b><BookingSummary booking={booked} /><p>现场预约仍待执行；预约安排不代表就医或检查完成。</p></> : canEdit && itemTools.needsBooking(task) ? <div style={{ display: 'grid', gap: 16 }}>
      {slots.map((s, i) => { const e = entries[i]; return <section key={s.id} style={{ background: '#F6FBF8', padding: 16, border: '1px solid #DCE9E2', borderRadius: 10, display: 'grid', gap: 10 }}>
        <b>{s.type === 'exam' ? '检查预约' : '门诊预约'} · {s.title}</b>
        <div>医院：{s.hospital || '未指定'}{s.campus ? ` · ${s.campus}` : ''}<br />{s.type === 'exam' ? '检查科室' : '就医/开单科室'}：{s.department || '待顾问确认'}<br />{s.candidates?.length ? '顾问候选专家' : s.type === 'exam' ? '检查专家' : '门诊专家'}：{s.candidates?.map(item => item.name).join('、') || s.expert || '未指定专家'}</div>
        {!s.department && <small style={{ color: '#B45309' }}>预约前需由顾问明确科室，现场办理也不能跳过。</small>}
        <label>办理方式<select className="form-input" value={e.mode} onChange={ev => change(s.id, 'mode', ev.target.value)}>
          <option value="prebook">健管专员提前预约</option>
          {s.type === 'exam' && <option value="onsite">就医专员现场预约</option>}
          <option value="not_required">无需预约（须填写依据）</option>
        </select></label>
        {e.mode === 'prebook' && <>
          {s.candidates?.length > 0 && <label>实际预约专家 *<select className="form-input" value={e.bookedExpertId} onChange={ev => change(s.id, 'bookedExpertId', ev.target.value)}><option value="">请选择最终约到的专家</option>{s.candidates.map(item => <option key={item.id} value={item.id}>{item.name}{item.title ? ` · ${item.title}` : ''}{item.campus ? ` · ${item.campus}` : ''}</option>)}</select></label>}
          {!s.department && <p role="alert" style={{ color: '#B45309' }}>顾问尚未明确科室，请先由健康顾问补充；健管专员不代定科室。</p>}
          {!s.hospital && <label>实际预约医院（顾问未指定）<input className="form-input" maxLength={200} value={e.hospital} onChange={ev => change(s.id, 'hospital', ev.target.value)} /></label>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <label>实际预约日期<DateField className="form-input" type="date" value={e.date} onChange={ev => change(s.id, 'date', ev.target.value)} /></label>
            <label>具体时间<input className="form-input" type="time" value={e.time} onChange={ev => change(s.id, 'time', ev.target.value)} /></label>
          </div>
        </>}
        <label>{e.mode === 'onsite' ? '现场预约前置条件及交接要求（必填，如先开单、缴费，再预约）' : e.mode === 'not_required' ? '无需预约的确认依据（必填）' : '预约备注（选填）'}<textarea className="form-input" rows={2} maxLength={2000} value={e.note} onChange={ev => change(s.id, 'note', ev.target.value)} /></label>
      </section> })}
      <button className="btn btn-primary" disabled={busy || !valid} onClick={async () => {
        setBusy(true); setError('')
        try { const res = await staffAPI.confirmAnnualBooking(task._id, { entries: entries.map((e, i) => ({ ...e, hospital: slots[i].hospital || e.hospital })) }); onLinked(res.data) }
        catch (e) { setError(e.message) } finally { setBusy(false) }
      }}>{busy ? '保存中…' : task.deliveryMode === 'reminder' ? '确认预约安排' : '确认预约安排，提交派单'}</button>
      <small>顾问要求不变；预约结果与现场待办分开留存。</small>
    </div> : <p>等待本事项健管专员处理预约。</p>}
    {error && <p role="alert" style={{ color: '#B91C1C' }}>{error}</p>}
  </section>
}
