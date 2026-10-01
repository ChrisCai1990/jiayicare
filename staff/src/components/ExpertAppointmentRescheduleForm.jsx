import DateField from '../../../shared/DateField.jsx'
import { useState } from 'react'
import { staffAPI } from '../api'

const recordTime = value => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '历史记录未保存操作时间'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}

const arrangement = row => [
  row?.hospital, row?.campus, row?.department, row?.expert || row?.appointmentExpert,
  [row?.appointmentDate || '日期未记录', row?.appointmentTime || '时间未记录'].join(' '),
].filter(Boolean).join(' · ')

export function ExpertAppointmentHistory({ order }) {
  const plan = order?.medicalProxyPlan || {}
  const booking = plan.booking || {}
  const slots = booking.appointmentSlots?.length ? booking.appointmentSlots : booking.appointmentDate ? [booking] : []
  const changes = Array.isArray(plan.bookingChanges) ? plan.bookingChanges : []
  if (!/专家约诊/.test(order?.serviceName || '') || (!slots.length && !changes.length)) return null
  return <div style={{ border: '1px solid #CFE4DA', borderRadius: 8, padding: 12, display: 'grid', gap: 9 }}>
    {slots.length > 0 && <div><strong>当前已确认预约：</strong>{slots.map((row, index) => `${index + 1}. ${arrangement({ ...row, hospital: row.hospital || booking.hospital || plan.hospital })}`).join('；')}</div>}
    {slots.length > 0 && <div style={{ fontSize: 12, color: '#4A6558' }}>预约任务确认时间（北京时间）：{recordTime(plan.bookedAt)}</div>}
    {changes.length > 0 && <details open style={{ borderTop: '1px solid #DCE8E1', paddingTop: 9 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>预约变更记录（{changes.length}次）</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        {changes.map((change, index) => <div key={`${change.changedAt || 'legacy'}-${index}`} style={{ background: '#F7FAF8', border: '1px solid #E0EAE4', borderRadius: 7, padding: 9, fontSize: 12 }}>
          <div><strong>第{index + 1}次{change.kind === 'correction' ? '历史补正' : '预约变更'} · 操作记录时间（北京时间）：</strong>{recordTime(change.changedAt)}</div>
          <div>记录人：{change.changedByName || '历史记录未保存姓名'}</div>
          <div>预约项目：第{Number(change.slotIndex || 0) + 1}项</div>
          <div>原安排：{arrangement(change.from)}</div>
          <div>新安排：{arrangement(change.to)}</div>
          {change.reason && <div>原因：{change.reason}</div>}
        </div>)}
      </div>
    </details>}
  </div>
}

export default function ExpertAppointmentRescheduleForm({ task, onSaved, showHistory = true }) {
  const booking = task?.sourceOrderId?.medicalProxyPlan?.booking || {}
  const slots = booking.appointmentSlots?.length ? booking.appointmentSlots : [{ appointmentDate: booking.appointmentDate, appointmentTime: booking.appointmentTime, department: booking.department, expert: booking.appointmentExpert }]
  const plan = task?.sourceOrderId?.medicalProxyPlan || {}
  const correction = task?.sourceOrderId?.status === 'completed'
  const [hospital,setHospital]=useState(booking.hospital || plan.hospital || '')
  const [campus,setCampus]=useState(slots[0]?.campus || booking.campus || '')
  const [department,setDepartment]=useState(slots[0]?.department || plan.department || '')
  const [expert,setExpert]=useState(slots[0]?.expert || booking.appointmentExpert || plan.expert || '')
  const [slotIndex, setSlotIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState(booking.appointmentDate || '')
  const [appointmentTime, setAppointmentTime] = useState(booking.appointmentTime || '')
  const [reason, setReason] = useState('')
  const [customerConfirmed, setCustomerConfirmed] = useState(false)
  const [hospitalConfirmed, setHospitalConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!appointmentDate || !appointmentTime || !reason.trim() || !customerConfirmed || !hospitalConfirmed) {
      setError('请填写新时间和原因，并确认客户、医院均已确认')
      return
    }
    setError('')
    setSaving(true)
    try {
      await staffAPI.rescheduleExpertAppointment(task._id, { slotIndex, appointmentDate, appointmentTime, hospital,campus,department,expert,baseUpdatedAt:task.sourceOrderId.updatedAt, reason: reason.trim(), customerConfirmed, hospitalConfirmed })
      onSaved?.()
    } catch (err) {
      setError(err.message || '保存改期记录失败')
    } finally {
      setSaving(false)
    }
  }

  return <div style={{ border: '1px solid #CFE4DA', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div><strong>预约记录</strong></div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(value => !value)}>{open ? '收起' : (correction ? '补正预约记录' : '修改预约')}</button>
    </div>
    {showHistory && <ExpertAppointmentHistory order={task?.sourceOrderId} />}
    {open && <>
      {slots.length > 1 && <label>选择需要改期的预约<select className="form-control" value={slotIndex} onChange={e => { const index = Number(e.target.value); setSlotIndex(index); setAppointmentDate(slots[index].appointmentDate || ''); setAppointmentTime(slots[index].appointmentTime || '');setCampus(slots[index].campus||booking.campus||'');setDepartment(slots[index].department||plan.department||'');setExpert(slots[index].expert||plan.expert||'') }}>{slots.map((row, index) => <option key={index} value={index}>{index + 1}. {row.department || row.expert || '预约'} · {row.appointmentDate} {row.appointmentTime}</option>)}</select></label>}
      <div style={{ fontSize: 12, color: '#63766D' }}>{correction ? '补正实际预约信息并保留历史，不重新派任务或发送通知。' : '记录已与客户及医院确认的安排，同步就诊提醒并通知客户。'}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label>新预约日期 *<DateField className="form-control" type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} /></label>
        <label>新预约时间 *<input className="form-control" type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} /></label>
      </div>
      <label>医院 *<input className="form-control" value={hospital} onChange={e=>setHospital(e.target.value)}/></label>
      <label>院区<input className="form-control" value={campus} onChange={e=>setCampus(e.target.value)}/></label>
      <label>科室 *<input className="form-control" value={department} onChange={e=>setDepartment(e.target.value)}/></label>
      <label>医生 *<input className="form-control" value={expert} onChange={e=>setExpert(e.target.value)}/></label>
      <label>变更原因与确认情况 *<textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label><input type="checkbox" checked={customerConfirmed} onChange={e => setCustomerConfirmed(e.target.checked)} /> 客户已确认新时间</label>
      <label><input type="checkbox" checked={hospitalConfirmed} onChange={e => setHospitalConfirmed(e.target.checked)} /> 医院已确认新预约</label>
      {error && <div style={{ color: '#B42318', fontSize: 13 }}>{error}</div>}
      <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? '保存中...' : '保存预约变更'}</button>
    </>}
  </div>
}
