import React from 'react'

export const isCheckupBookingTask = task => task?.sourceType === 'health_plan'
  && task?.taskRole === 'executor'
  && task?.followUpSchemeId?.executorRole === 'healthPlanner'

export const isCheckupOnsiteTask = task => task?.sourceType === 'health_plan'
  && task?.taskRole === 'executor'
  && task?.followUpSchemeId?.executorRole === 'medicalAssistant'

export function normalizeCheckupOnsiteChecklist(task, checklist = []) {
  if (!isCheckupOnsiteTask(task)) return checklist
  return checklist.map(item => item?.appointmentDetails && !item.handoffSummary
    ? { ...item, handoffSummary: item.executionResult || '', executionStatus: '', executionResult: '', nextAction: '' }
    : item)
}

export function bookingDetailsFromChecklist(checklist = []) {
  return checklist?.[0]?.appointmentDetails || {}
}

export function bookingDetailsFromTask(task) {
  const saved = bookingDetailsFromChecklist(task?.serviceChecklist)
  const content = task?.sourceHealthPlanId?.content || {}
  const visit = content.moduleData?.visit || {}
  const confirmed = content.confirmedServiceSchedule || {}
  const confirmedPreparation = typeof content.notes === 'string' ? content.notes : content.notes?.content
  const rawDate = content.serviceDate || visit.visitDate || confirmed.serviceDate || ''
  const rawTime = content.serviceTime || visit.serviceTime || confirmed.serviceTime || ''
  return {
    hospital: saved.hospital || content.hospital || visit.hospital || '',
    campus: saved.campus || content.campus || visit.campus || '',
    department: saved.department || content.department || visit.department || content.checkupCenter || '体检中心',
    floor: saved.floor || content.floor || visit.floor || '',
    registrationWindow: saved.registrationWindow || content.registrationWindow || visit.registrationWindow || '',
    contactName: saved.contactName || content.hospitalContact || visit.contactName || '',
    contactPhone: saved.contactPhone || content.hospitalContactPhone || visit.contactPhone || '',
    meetingPoint: saved.meetingPoint || content.meetingPoint || visit.meetingPoint || '',
    appointmentDate: saved.appointmentDate || String(rawDate).slice(0, 10),
    appointmentTime: saved.appointmentTime || String(rawTime).slice(0, 5),
    preparation: saved.preparation || content.checkupPreparation || visit.preparation || confirmedPreparation || '',
    specialExams: saved.specialExams || '',
    expertArrangements: saved.expertArrangements || '',
    notes: saved.notes || '',
  }
}

export function bookingChecklist(details) {
  const summary = [
    `医院：${details.hospital}`,
    details.campus && `院区：${details.campus}`,
    `体检时间：${details.appointmentDate} ${details.appointmentTime}`,
    `报到地点：${[details.department, details.floor, details.registrationWindow].filter(Boolean).join(' · ')}`,
    details.contactName && `院方联系人：${details.contactName}${details.contactPhone ? ` ${details.contactPhone}` : ''}`,
    details.meetingPoint && `陪诊会合点：${details.meetingPoint}`,
    details.preparation && `行前准备：${details.preparation}`,
    details.specialExams && `特殊检查安排：${details.specialExams}`,
    details.expertArrangements && `门诊/专家及时间安排：${details.expertArrangements}`,
    details.notes && `其他说明：${details.notes}`,
  ].filter(Boolean).join('\n')
  return [{
    key: 'checkup_booking_handoff',
    purpose: '按已确认的预约信息完成体检日陪诊',
    executionStatus: 'completed',
    executionResult: summary,
    appointmentDetails: details,
  }]
}

const fields = [
  ['hospital', '预约医院 *', '如：邵逸夫医院'],
  ['campus', '院区', '如：庆春院区'],
  ['department', '科室/体检中心 *', '如：内镜中心'],
  ['floor', '楼栋与楼层 *', '如：3号楼 4层'],
  ['registrationWindow', '报到窗口/诊室', '如：内镜中心2号窗口'],
  ['contactName', '院方联系人', '姓名或服务台'],
  ['contactPhone', '联系电话', '院方联系电话'],
  ['meetingPoint', '陪诊会合地点 *', '陪诊专员与客户会合的准确位置'],
]

export default function CheckupBookingForm({ value, onChange }) {
  const update = (key, next) => onChange({ ...value, [key]: next })
  return <div style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
    <div style={{ padding: '12px 14px', background: '#F2F8F5' }}>
      <div style={{ fontSize: 14, fontWeight: 750, color: '#29483C' }}>体检预约确认与陪诊交接</div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>确认完成后，以下信息将直接生成陪诊专员的体检日任务清单。</div>
    </div>
    <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {fields.map(([key, label, placeholder]) => <label key={key} style={{ fontSize: 12, color: '#65776F' }}>
        {label}<input className="form-control" value={value[key] || ''} onChange={e => update(key, e.target.value)} placeholder={placeholder} style={{ marginTop: 5 }} />
      </label>)}
      <label style={{ fontSize: 12, color: '#65776F' }}>体检日期 *<input type="date" className="form-control" value={value.appointmentDate || ''} onChange={e => update('appointmentDate', e.target.value)} style={{ marginTop: 5 }} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>到院时间 *<input type="time" className="form-control" value={value.appointmentTime || ''} onChange={e => update('appointmentTime', e.target.value)} style={{ marginTop: 5 }} /></label>
      <label style={{ gridColumn: '1 / -1', fontSize: 12, color: '#65776F' }}>体检前准备事项 *<textarea className="form-control" rows={3} value={value.preparation || ''} onChange={e => update('preparation', e.target.value)} placeholder="饮食、停药、证件、缴费、取号等注意事项" style={{ marginTop: 5 }} /></label>
      <label style={{ gridColumn: '1 / -1', fontSize: 12, color: '#65776F' }}>特殊检查安排<textarea className="form-control" rows={2} value={value.specialExams || ''} onChange={e => update('specialExams', e.target.value)} placeholder="如：胃肠镜、增强CT等检查的地点、顺序与时间" style={{ marginTop: 5 }} /></label>
      <label style={{ gridColumn: '1 / -1', fontSize: 12, color: '#65776F' }}>门诊/专家及时间安排<textarea className="form-control" rows={2} value={value.expertArrangements || ''} onChange={e => update('expertArrangements', e.target.value)} placeholder="如：检查后前往某科室，由某位专家于几点接诊" style={{ marginTop: 5 }} /></label>
      <label style={{ gridColumn: '1 / -1', fontSize: 12, color: '#65776F' }}>其他交接说明<textarea className="form-control" rows={2} value={value.notes || ''} onChange={e => update('notes', e.target.value)} placeholder="停车、路线、特殊照护需求等" style={{ marginTop: 5 }} /></label>
    </div>
  </div>
}
