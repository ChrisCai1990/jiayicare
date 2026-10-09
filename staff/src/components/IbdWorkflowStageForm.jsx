import React from 'react'
import DateField from '../../../shared/DateField.jsx'
import ibdIntake from '../../../shared/ibdIntake.cjs'

export const ibdStage = task => String(task?.workflowKey || '').startsWith('ibd:')
  ? String(task.workflowKey).slice(4) : ''

export const ibdSubmitLabel = (stage, status) => status === 'in_progress'
  ? '保存处理进展'
  : stage === 'advisor' ? '确认并转健管专员预约' : '确认首诊预约与陪诊'

export const ibdTaskTitle = stage => stage === 'advisor'
  ? 'IBD · 健康顾问确定首诊方案' : 'IBD · 健管专员预约及首次陪诊'

export const ibdFormDataFromTask = task => ibdStage(task) === 'advisor'
  ? ibdIntake.advisorDraft(task?.formData, task?.sourceOrderId?.note)
  : (task?.formData || {})

export function validateIbdStage(stage, data = {}) {
  const filled = value => String(value || '').trim()
  if (stage === 'advisor' && ['hospital', 'department', 'expert', 'visitPurpose'].some(key => !filled(data[key])))
    return '请填写医院、科室、专家和本次就诊目的'
  if (stage === 'booking' && (!/^\d{4}-\d{2}-\d{2}$/.test(filled(data.appointmentDate)) || !filled(data.appointmentTime) || !filled(data.escortArrangement)))
    return '请填写确认后的就诊日期、时间和首次陪诊安排'
  return ''
}

export default function IbdWorkflowStageForm({ task, value = {}, onChange }) {
  const stage = ibdStage(task)
  const update = (key, next) => onChange({ ...value, [key]: next })
  const label = { fontSize: 12, fontWeight: 650, display: 'grid', gap: 5 }
  if (stage === 'advisor') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 12, color: '#65776F' }}>客户意向仅供参考；由健康顾问确认就诊建议，并负责与专科对接。</div>
    {value.customerRequest && <div style={{ padding: 10, background: '#F5F8F6', whiteSpace: 'pre-wrap', fontSize: 12 }}>规划师交接：{value.customerRequest}</div>}
    {value.preferredDateStart && <div style={{ fontSize: 12, color: '#4A6558' }}>客户期望就诊日期：{new Date(value.preferredDateStart).toLocaleDateString('zh-CN')}</div>}
    <label style={label}>建议医院 *<input className="form-control" value={value.hospital || ''} onChange={e => update('hospital', e.target.value)} />{value.hospitalSource === 'customer_intention' && <span style={{ fontWeight: 400, color: '#65776F' }}>已带入客户意向医院，请核对后确认。</span>}</label>
    <label style={label}>科室 *<input className="form-control" value={value.department || ''} onChange={e => update('department', e.target.value)} /></label>
    <label style={label}>专家 *<input className="form-control" value={value.expert || ''} onChange={e => update('expert', e.target.value)} /></label>
    <label style={label}>本次就诊目的 *<textarea className="form-control" rows={3} value={value.visitPurpose || ''} onChange={e => update('visitPurpose', e.target.value)} /></label>
  </div>
  if (stage === 'booking') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: 10, background: '#F5F8F6', fontSize: 12, lineHeight: 1.7 }}>顾问建议：{value.proposal?.hospital} · {value.proposal?.department} · {value.proposal?.expert}<br />就诊目的：{value.proposal?.visitPurpose}</div>
    <label style={label}>确认后的就诊日期 *<DateField className="form-control" type="date" value={value.appointmentDate || ''} onChange={e => update('appointmentDate', e.target.value)} /></label>
    <label style={label}>确认后的就诊时间 *<input className="form-control" type="time" value={value.appointmentTime || ''} onChange={e => update('appointmentTime', e.target.value)} /></label>
    <label style={label}>首次陪诊安排 *<textarea className="form-control" rows={3} value={value.escortArrangement || ''} onChange={e => update('escortArrangement', e.target.value)} placeholder="陪诊人员、集合地点和联系安排" /></label>
    <div style={{ fontSize: 12, color: '#65776F' }}>未约妥时选择“处理中”并记录进展；不要填虚构日期完成任务。</div>
  </div>
  return null
}
