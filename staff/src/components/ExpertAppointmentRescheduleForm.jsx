import { useState } from 'react'
import { staffAPI } from '../api'

export default function ExpertAppointmentRescheduleForm({ task, onSaved }) {
  const booking = task?.sourceOrderId?.medicalProxyPlan?.booking || {}
  const [open, setOpen] = useState(false)
  const [appointmentDate, setAppointmentDate] = useState(booking.appointmentDate || '')
  const [appointmentTime, setAppointmentTime] = useState(booking.appointmentTime || '')
  const [reason, setReason] = useState('客户提出改期，医院已确认新预约时间')
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
      await staffAPI.rescheduleExpertAppointment(task._id, { appointmentDate, appointmentTime, reason: reason.trim(), customerConfirmed, hospitalConfirmed })
      onSaved?.()
    } catch (err) {
      setError(err.message || '保存改期记录失败')
    } finally {
      setSaving(false)
    }
  }

  return <div style={{ border: '1px solid #CFE4DA', borderRadius: 8, padding: 12, display: 'grid', gap: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div><strong>当前已确认预约</strong>：{booking.appointmentDate || '未记录'} {booking.appointmentTime || ''}</div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(value => !value)}>{open ? '收起' : '补记预约改期'}</button>
    </div>
    {open && <>
      <div style={{ fontSize: 12, color: '#63766D' }}>仅记录已经与医院及客户确认的新时间；保存后同步通知客户并更新就诊提醒，本单仍停留在等待就诊资料环节。</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label>新预约日期 *<input className="form-control" type="date" value={appointmentDate} onChange={e => setAppointmentDate(e.target.value)} /></label>
        <label>新预约时间 *<input className="form-control" type="time" value={appointmentTime} onChange={e => setAppointmentTime(e.target.value)} /></label>
      </div>
      <label>改期原因与确认情况 *<textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label><input type="checkbox" checked={customerConfirmed} onChange={e => setCustomerConfirmed(e.target.checked)} /> 客户已确认新时间</label>
      <label><input type="checkbox" checked={hospitalConfirmed} onChange={e => setHospitalConfirmed(e.target.checked)} /> 医院已确认新预约</label>
      {error && <div style={{ color: '#B42318', fontSize: 13 }}>{error}</div>}
      <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? '保存中...' : '保存改期记录'}</button>
    </>}
  </div>
}
