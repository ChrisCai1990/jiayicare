import React from 'react'

export const isCheckupAppointmentBookingTask = task => task?.sourceType === 'order'
  && task?.workflowKey === 'checkup_appointment:booking'

const emptyAppointment = { campus: '', department: '', location: '', doctor: '', date: '', time: '' }
const emptySpecialCheckAppointment = { ...emptyAppointment, checkItem: '' }
const appointmentRows = (rows, legacy, empty) => (Array.isArray(rows) ? rows : [legacy || empty]).map(row => ({ ...empty, ...(row || {}) }))

export function checkupAppointmentBookingFromTask(task) {
  const data = task?.formData || {}
  const legacyFinalConsultation = { ...(data.expertAppointment || {}), ...(data.postCheckExpertAppointment || {}) }
  return {
    ...data,
    specialCheckRequired: data.intake?.serviceType === 'special' || data.specialCheckRequired === true,
    orderFormAppointments: appointmentRows(data.orderFormAppointments, data.orderFormAppointment, emptyAppointment),
    specialCheckAppointments: appointmentRows(data.specialCheckAppointments, data.specialCheckAppointment, emptySpecialCheckAppointment),
    postCheckExpertAppointments: appointmentRows(data.postCheckExpertAppointments, legacyFinalConsultation, emptyAppointment),
  }
}

function AppointmentList({ title, rows, onChange, hint, specialCheck = false }) {
  const empty = specialCheck ? emptySpecialCheckAppointment : emptyAppointment
  return <div style={{ display: 'grid', gap: 10 }}>
    {rows.map((row, index) => <div key={index}>
      <AppointmentFields title={`${title} ${index + 1}`} value={row} onChange={next => onChange(rows.map((item, i) => i === index ? next : item))} hint={hint} specialCheck={specialCheck} />
      {rows.length > 1 && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => onChange(rows.filter((_, i) => i !== index))}>移除这项预约</button>}
    </div>)}
    <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => onChange([...rows, { ...empty }])}>＋ 新增{title}</button>
  </div>
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
      <label style={{ fontSize: 12, color: '#65776F' }}>医生/专家{specialCheck ? '（如需指定）' : ' *'}<input className="form-control" value={value.doctor || ''} onChange={e => update('doctor', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>预约日期 *<input type="date" className="form-control" value={value.date || ''} onChange={e => update('date', e.target.value)} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>预约时间 *<input type="time" className="form-control" value={value.time || ''} onChange={e => update('time', e.target.value)} /></label>
      <div style={{ alignSelf: 'end', fontSize: 12, color: '#65776F', lineHeight: 1.55 }}>{hint}</div>
    </div>
  </section>
}

export default function CheckupAppointmentBookingForm({ task, value, onChange }) {
  const data = checkupAppointmentBookingFromTask({ ...task, formData: value })
  const intake = data.intake || task?.formData?.intake || {}
  const needsSpecialCheck = data.specialCheckRequired
  const update = (key, next) => onChange({ ...data, [key]: next })
  const checkItems = (intake.checkItems || []).map(item => item.name).filter(Boolean).join('、')
  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: '12px 14px', borderRadius: 9, background: '#FFF8ED', color: '#5E513D', fontSize: 13, lineHeight: 1.65 }}>
      <b>客户检查需求：</b>{checkItems || '—'}<br />
      <b>检查机构：</b>{intake.institution || '—'}　<b>空腹：</b>{intake.fastingRequired ? '需要' : '不需要'}
    </div>
    <AppointmentList title="① 开检查单号" rows={data.orderFormAppointments} onChange={next => update('orderFormAppointments', next)} hint="可按不同科室或医生分别预约开单。" />
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '11px 14px', background: '#F2F8F5', fontWeight: 750, color: '#29483C' }}>② 特殊检查预约</div>
      <div style={{ padding: 14 }}>
        <label><input type="checkbox" checked={needsSpecialCheck} disabled={intake.serviceType === 'special'} onChange={e => onChange({ ...data, specialCheckRequired: e.target.checked, specialCheckAppointments: e.target.checked ? [{ ...emptySpecialCheckAppointment }] : [], specialCheckAppointment: { ...emptySpecialCheckAppointment } })} /> 本次有需要提前预约的特殊检查（如部分超声）</label>
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 6 }}>{intake.serviceType === 'special' ? '特殊约检必须填写本环节。' : '无需提前预约时不勾选，仍保留本环节以便核对。'}</div>
      </div>
      {needsSpecialCheck && <div style={{ padding: 14, paddingTop: 0 }}><AppointmentList title="特殊检查预约" rows={data.specialCheckAppointments} onChange={next => update('specialCheckAppointments', next)} hint="逐项填写检查项目、地点和时间；仅需指定医生时填写姓名。" specialCheck /></div>}
    </section>
    <AppointmentList title="③ 检查后专家门诊" rows={data.postCheckExpertAppointments} onChange={next => update('postCheckExpertAppointments', next)} hint={needsSpecialCheck ? '专家看诊时间须晚于全部特殊检查。' : '专家看诊时间不能早于开检查单。'} />
  </div>
}
