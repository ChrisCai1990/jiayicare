import React from 'react'
import { ChecklistAttachments } from './ServiceTaskChecklist'

export const isOutpatientEscortVisitTask = task => task?.taskRole === 'executor' && /门诊一站式.*检查及专家门诊陪诊与归档/.test(task?.theme || '')
const sourceFromTask = task => task?.dependsOnTaskId?.formData || task?.dependsOnTaskId?.dependsOnTaskId?.formData || {}
const labelStyle = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
const scheduleText = row => [row?.appointmentDate, row?.appointmentTime].filter(Boolean).join(' ') || '时间待确认'

export const emptyOutpatientEscortVisit = (task, value) => {
  const saved = value || {}
  return {
    inspectionCompleted: !!saved.inspectionCompleted,
    inspectionProcess: saved.inspectionProcess || '',
    specialSituations: saved.specialSituations || '',
    expertVisitCompleted: !!saved.expertVisitCompleted,
    expertVisitSummary: saved.expertVisitSummary || '',
    examOrdersPrinted: !!saved.examOrdersPrinted,
    medicalRecordPrinted: !!saved.medicalRecordPrinted,
    examOrderFiles: Array.isArray(saved.examOrderFiles) ? saved.examOrderFiles : [],
    medicalRecordFiles: Array.isArray(saved.medicalRecordFiles) ? saved.medicalRecordFiles : [],
    handoffSnapshot: saved.handoffSnapshot || sourceFromTask(task),
  }
}

export const validateOutpatientEscortVisit = value => {
  if (!value?.inspectionCompleted) return '请确认已陪同完成当日检验检查'
  if (!value?.inspectionProcess?.trim()) return '请填写当日检验检查过程'
  if (!value?.specialSituations?.trim()) return '请填写特殊情况；如无，请填写“无”'
  if (!value?.expertVisitCompleted) return '请确认已陪同完成专家看诊'
  if (!value?.expertVisitSummary?.trim()) return '请填写专家看诊情况、诊疗意见及医嘱'
  if (!value?.examOrdersPrinted || !value?.medicalRecordPrinted) return '请确认当日检验检查单和门诊病历均已打印'
  if (!value?.examOrderFiles?.length) return '请上传当日打印的检验检查单'
  if (!value?.medicalRecordFiles?.length) return '请上传当日打印的门诊病历'
  return ''
}

export default function OutpatientEscortVisitForm({ task, value, onChange }) {
  const data = emptyOutpatientEscortVisit(task, value)
  const source = data.handoffSnapshot || {}
  const booking = source.bookingSnapshot || {}
  const checks = source.checkAppointments?.length ? source.checkAppointments : (booking.specialCheckAppointments || [])
  const expertVisit = booking.postCheckAppointment || {}
  const timeline = [
    ...checks.map(row => ({ ...row, kind: 'check' })),
    ...(expertVisit.appointmentDate || expertVisit.appointmentTime ? [{ ...expertVisit, item: '检查后专家门诊', kind: 'expert' }] : []),
  ].sort((a, b) => `${a.appointmentDate || '9999-99-99'} ${a.appointmentTime || '99:99'}`.localeCompare(`${b.appointmentDate || '9999-99-99'} ${b.appointmentTime || '99:99'}`))
  const update = patch => onChange({ ...data, ...patch })
  const attachmentUpdate = key => (_, patch) => update({ [key]: patch.attachments || [] })
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 15, borderRadius: 10, background: '#FFFAF2', border: '1px solid #E8DCC8', display: 'grid', gap: 9 }}>
      <b style={{ color: '#6F5222' }}>陪诊日安排（只读）</b>
      <div><b>{booking.hospital || '医院待确认'} · {booking.campus || '院区待确认'}</b></div>
      {timeline.map((row, index) => <div key={`${row.kind}-${index}`} style={{ padding: '9px 11px', borderRadius: 8, background: row.kind === 'expert' ? '#F2F8F5' : '#fff' }}><b>{index + 1}. {row.item || '项目待确认'}</b><div>{row.department || '科室待确认'} · {row.location || (row.kind === 'expert' ? '门诊地点待确认' : '地点待确认')} · {scheduleText(row)} · {row.expertName || (row.kind === 'expert' ? '专家待确认' : '无')}</div></div>)}
    </section>
    <section style={{ padding: 15, border: '1px solid #B9DDD0', borderRadius: 10, display: 'grid', gap: 12 }}>
      <b>当日检验检查陪诊记录</b>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={data.inspectionCompleted} onChange={e => update({ inspectionCompleted: e.target.checked })} />确认已陪同完成当日检验检查</label>
      <label style={labelStyle}>检验检查过程 *<textarea className="form-control" rows={4} value={data.inspectionProcess} onChange={e => update({ inspectionProcess: e.target.value })} placeholder="按时间顺序记录完成项目、科室地点、等候及衔接情况" /></label>
      <label style={labelStyle}>特殊情况记录 *<textarea className="form-control" rows={3} value={data.specialSituations} onChange={e => update({ specialSituations: e.target.value })} placeholder="记录临时加项、未完成项目、异常情况及处理；如无请填写“无”" /></label>
    </section>
    <section style={{ padding: 15, border: '1px solid #B9DDD0', borderRadius: 10, display: 'grid', gap: 12 }}>
      <b>专家看诊记录</b>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={data.expertVisitCompleted} onChange={e => update({ expertVisitCompleted: e.target.checked })} />确认已陪同完成专家看诊</label>
      <label style={labelStyle}>专家看诊情况、诊疗意见及医嘱 *<textarea className="form-control" rows={4} value={data.expertVisitSummary} onChange={e => update({ expertVisitSummary: e.target.value })} placeholder="记录专家判断、用药意见、后续复查或复诊安排" /></label>
    </section>
    <section style={{ padding: 15, border: '1px solid #E3D2A8', borderRadius: 10, background: '#FFFCF5', display: 'grid', gap: 12 }}>
      <b>当日纸质资料打印与归档</b>
      <div style={{ fontSize: 12, color: '#6F6550' }}>离院前请医生打印当日检验检查单和门诊病历，并分别上传归档。</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={data.examOrdersPrinted} onChange={e => update({ examOrdersPrinted: e.target.checked })} />已打印当日检验检查单 *</label>
      <ChecklistAttachments item={{ attachments: data.examOrderFiles }} index={0} mode="executor" update={attachmentUpdate('examOrderFiles')} uploadLabel="+ 上传当日检验检查单" errorLabel="检验检查单上传失败" />
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={data.medicalRecordPrinted} onChange={e => update({ medicalRecordPrinted: e.target.checked })} />已要求医生打印当日门诊病历 *</label>
      <ChecklistAttachments item={{ attachments: data.medicalRecordFiles }} index={0} mode="executor" update={attachmentUpdate('medicalRecordFiles')} uploadLabel="+ 上传当日门诊病历" errorLabel="门诊病历上传失败" />
    </section>
  </div>
}
