import React from 'react'
import DateField from '../../../shared/DateField.jsx'
import ibdIntake from '../../../shared/ibdIntake.cjs'

export const ibdStage = task => String(task?.workflowKey || '').startsWith('ibd:')
  ? String(task.workflowKey).slice(4) : ''

export const ibdSubmitLabel = (stage, status) => status === 'in_progress'
  ? '保存处理进展'
  : ({ advisor: '确认并转健管专员预约', booking: '确认预约并转健康规划师', planner: '确认陪诊人员并转交', escort: '确认碰面安排' }[stage] || '保存')

export const ibdTaskTitle = stage => ({ advisor: 'IBD · 健康顾问确定首诊方案', booking: 'IBD · 健管专员确认首诊预约', planner: 'IBD · 健康规划师指定陪诊人员', escort: 'IBD · 陪诊人员确认碰面安排' }[stage] || 'IBD 专病管理')

export const ibdFormDataFromTask = task => ibdStage(task) === 'advisor'
  ? ibdIntake.advisorDraft(task?.formData, task?.sourceOrderId?.note)
  : (task?.formData || {})

export function validateIbdStage(stage, data = {}) {
  const filled = value => String(value || '').trim()
  if (stage === 'advisor' && ['hospital', 'department', 'expert', 'visitPurpose'].some(key => !filled(data[key])))
    return '请填写医院、科室、专家和本次就诊目的'
  if (stage === 'booking' && (!/^\d{4}-\d{2}-\d{2}$/.test(filled(data.appointmentDate)) || !filled(data.appointmentTime) || !filled(data.campus)))
    return '请填写确认后的就诊日期、时间和院区'
  if (stage === 'planner' && !filled(data.escortStaffId)) return '请从员工库选择首次陪诊人员'
  if (stage === 'escort' && (!filled(data.meetingPoint) || !filled(data.contactArrangement))) return '请填写具体碰面地点和联系安排'
  return ''
}

export default function IbdWorkflowStageForm({ task, value = {}, staffList = [], onChange }) {
  const stage = ibdStage(task)
  const update = (key, next) => onChange({ ...value, [key]: next })
  const label = { fontSize: 12, fontWeight: 650, display: 'grid', gap: 5 }
  if (stage === 'advisor') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 12, color: '#65776F' }}>客户意向仅供参考；由健康顾问确认就诊建议，并负责与专科对接。</div>
    {value.customerRequest && <div style={{ padding: 10, background: '#F5F8F6', whiteSpace: 'pre-wrap', fontSize: 12 }}>规划师交接：{value.customerRequest}</div>}
    {value.preferredDateStart && <div style={{ fontSize: 12, color: '#4A6558' }}>客户期望就诊日期：{new Date(value.preferredDateStart).toLocaleDateString('zh-CN')}</div>}
    <label style={label}>建议医院 *<input className="form-control" value={value.hospital || ''} onChange={e => update('hospital', e.target.value)} />{value.hospitalSource === 'customer_intention' && <span style={{ fontWeight: 400, color: '#65776F' }}>已带入客户意向医院，请核对后确认。</span>}</label>
    <label style={label}>建议院区（可由预约确认）<input className="form-control" value={value.campus || ''} onChange={e => update('campus', e.target.value)} placeholder="例如：庆春院区" /></label>
    <label style={label}>科室 *<input className="form-control" value={value.department || ''} onChange={e => update('department', e.target.value)} /></label>
    <label style={label}>专家 *<input className="form-control" value={value.expert || ''} onChange={e => update('expert', e.target.value)} /></label>
    <label style={label}>本次就诊目的 *<textarea className="form-control" rows={3} value={value.visitPurpose || ''} onChange={e => update('visitPurpose', e.target.value)} /></label>
  </div>
  if (stage === 'booking') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: 10, background: '#F5F8F6', fontSize: 12, lineHeight: 1.7 }}>顾问建议：{value.proposal?.hospital} · {value.proposal?.campus || '院区待确认'} · {value.proposal?.department} · {value.proposal?.expert}<br />就诊目的：{value.proposal?.visitPurpose}</div>
    <label style={label}>确认后的就诊院区 *<input className="form-control" value={value.campus || ''} onChange={e => update('campus', e.target.value)} placeholder="以实际预约院区为准" /></label>
    <label style={label}>确认后的就诊日期 *<DateField className="form-control" type="date" value={value.appointmentDate || ''} onChange={e => update('appointmentDate', e.target.value)} /></label>
    <label style={label}>确认后的就诊时间 *<input className="form-control" type="time" value={value.appointmentTime || ''} onChange={e => update('appointmentTime', e.target.value)} /></label>
    <div style={{ fontSize: 12, color: '#65776F' }}>确认预约后由健康规划师指定陪诊人员，具体碰面地点由陪诊人员确定。未约妥时保存为处理中。</div>
  </div>
  const booking = <div style={{ padding: 10, background: '#F5F8F6', fontSize: 12, lineHeight: 1.7 }}>首诊预约：{value.proposal?.hospital} · {value.campus || '院区待确认'} · {value.proposal?.department} · {value.proposal?.expert}<br />{value.appointmentDate || '日期待确认'} {value.appointmentTime || ''}</div>
  if (stage === 'planner') return <div style={{ display: 'grid', gap: 12 }}>
    {booking}
    <label style={label}>首次陪诊人员 *<select className="form-control" value={value.escortStaffId || ''} onChange={e => update('escortStaffId', e.target.value)}><option value="">从员工库选择在职就医专员</option>{staffList.filter(person => person.role === 'medicalAssistant' && person.staffStatus !== 'inactive').map(person => <option key={person._id} value={person._id}>{person.name}</option>)}</select></label>
    <div style={{ fontSize: 12, color: '#65776F' }}>具体碰面地点和联系安排由选定的陪诊人员确认。</div>
  </div>
  if (stage === 'escort') return <div style={{ display: 'grid', gap: 12 }}>
    {booking}
    <label style={label}>具体碰面地点 *<input className="form-control" value={value.meetingPoint || ''} onChange={e => update('meetingPoint', e.target.value)} placeholder="写明院区、楼栋、入口或楼层" /></label>
    <label style={label}>联系安排 *<textarea className="form-control" rows={2} value={value.contactArrangement || ''} onChange={e => update('contactArrangement', e.target.value)} placeholder="见面时间和联系方法" /></label>
  </div>
  return null
}
