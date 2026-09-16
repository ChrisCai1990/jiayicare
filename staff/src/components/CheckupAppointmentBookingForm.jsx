import React from 'react'

export const isCheckupAppointmentBookingTask = task => task?.sourceType === 'order'
  && task?.workflowKey === 'checkup_appointment:booking'

const emptyAppointment = { campus: '', department: '', location: '', doctor: '', date: '', time: '' }
const emptySpecialCheckAppointment = { ...emptyAppointment, checkItem: '' }

export function checkupAppointmentBookingFromTask(task) {
  const data = task?.formData || {}
  const legacyFinalConsultation = data.expertAppointment || {}
  return {
    ...data,
    orderFormAppointment: { ...emptyAppointment, ...(data.orderFormAppointment || {}) },
    specialCheckAppointment: { ...emptySpecialCheckAppointment, ...(data.specialCheckAppointment || {}) },
    postCheckExpertAppointment: { ...emptyAppointment, ...legacyFinalConsultation, ...(data.postCheckExpertAppointment || {}) },
  }
}

function AppointmentFields({ title, value, onChange, hint, specialCheck = false }) {
  const update = (key, next) => onChange({ ...value, [key]: next })
  return <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ padding: '11px 14px', background: '#F2F8F5', fontWeight: 750, color: '#29483C' }}>{title}</div>
    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {specialCheck && <label style={{ fontSize: 12, color: '#65776F', gridColumn: '1 / -1' }}>特殊检查项目 *<input className="form-control" placeholder="例如：甲状腺超声" value={value.checkItem || ''} onChange={e => update('checkItem', e.target.value)} /></label>}
      <label style={{ fontSize: 12, color: '#65776F' }}>院区 *<input className="form-control" placeholder="例如：庆春院区" value={value.campus || ''} onChange={e => update('campus', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>科室 *<input className="form-control" value={value.department || ''} onChange={e => update('department', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>具体地点 *<input className="form-control" placeholder="例如：3号楼 2层 B区" value={value.location || ''} onChange={e => update('location', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>医生/专家 *<input className="form-control" value={value.doctor || ''} onChange={e => update('doctor', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>预约日期 *<input type="date" className="form-control" value={value.date || ''} onChange={e => update('date', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>预约时间 *<input type="time" className="form-control" value={value.time || ''} onChange={e => update('time', e.target.value)} /></label>
      <div style={{ alignSelf: 'end', fontSize: 12, color: '#65776F', lineHeight: 1.55 }}>{hint}</div>
    </div>
  </section>
}

export default function CheckupAppointmentBookingForm({ task, value, onChange }) {
  const data = checkupAppointmentBookingFromTask({ ...task, formData: value })
  const intake = data.intake || task?.formData?.intake || {}
  const needsSpecialCheck = intake.serviceType === 'special'
  const update = (key, next) => onChange({ ...data, [key]: next })
  const checkItems = (intake.checkItems || []).map(item => item.name).filter(Boolean).join('、')
  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: '12px 14px', borderRadius: 9, background: '#FFF8ED', color: '#5E513D', fontSize: 13, lineHeight: 1.65 }}>
      <b>客户检查需求：</b>{checkItems || '—'}<br />
      <b>检查机构：</b>{intake.institution || '—'}　<b>空腹：</b>{intake.fastingRequired ? '需要' : '不需要'}
    </div>
    <AppointmentFields title="① 开检查单号" value={data.orderFormAppointment} onChange={next => update('orderFormAppointment', next)} hint="用于开具本次检查所需的检查单。" />
    {needsSpecialCheck && <AppointmentFields title="② 特殊检查专家号" value={data.specialCheckAppointment} onChange={next => update('specialCheckAppointment', next)} hint="特殊检查应在最终专家看诊前完成。" specialCheck />}
    <AppointmentFields title={needsSpecialCheck ? '③ 检查后专家看诊号' : '② 检查后专家看诊号'} value={data.postCheckExpertAppointment} onChange={next => update('postCheckExpertAppointment', next)} hint={needsSpecialCheck ? '检查完成后由专家看诊，时间须晚于特殊检查。' : '常规检查完成后由专家看诊，日期不能早于开检查单号。'} />
  </div>
}
