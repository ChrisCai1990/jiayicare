import React, { useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupMedicalExecutionTask = task => task?.sourceType === 'order' && task?.workflowKey === 'checkup_appointment:medical'
const patientIdOf = task => task?.patientId?._id || task?.patientId
const label = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

export function checkupMedicalExecutionFromTask(task) {
  const data = task?.formData || {}; const booking = data.booking || {}
  const intake = data.intake || booking.intake || {}
  const existing = Array.isArray(data.checkAppointments) ? data.checkAppointments : []
  const requestedItems = (intake.checkItems || []).flatMap(item => String(item?.name || '').split(/[、，,\n；;]/).map(name => name.trim()).filter(Boolean))
  const special = booking.specialCheckAppointment || {}
  const checks = requestedItems.map((item, index) => {
    const managerBooked = special.checkItem && (String(special.checkItem).includes(item) || item.includes(String(special.checkItem)))
    return { item, department: managerBooked ? special.department || '' : existing[index]?.department || '', campus: managerBooked ? special.campus || '' : existing[index]?.campus || '', appointmentDate: managerBooked ? special.date || '' : existing[index]?.appointmentDate || '', appointmentTime: managerBooked ? special.time || '' : existing[index]?.appointmentTime || '', managerBooked }
  })
  return { ...data, intake, booking, examOrderStatus: data.examOrderStatus || '', examOrderNote: data.examOrderNote || '', checkAppointments: checks, inspectionCompleted: !!data.inspectionCompleted, expertVisitCompleted: !!data.expertVisitCompleted, expertVisitSummary: data.expertVisitSummary || '', reportIds: data.reportIds || [], medicalRecordIds: data.medicalRecordIds || [] }
}

export function validateCheckupMedicalExecution(data) {
  if (!data.examOrderStatus) return '请填写开检查单情况'
  if ((data.checkAppointments || []).some(row => !row.campus?.trim() || !row.department?.trim() || !row.appointmentDate || !row.appointmentTime)) return '请完整填写每项检查的院区、科室和预约时间'
  const finalVisit = data.booking?.postCheckExpertAppointment || data.booking?.expertAppointment || {}
  if ((data.checkAppointments || []).some(row => `${row.appointmentDate}T${row.appointmentTime}` >= `${finalVisit.date || ''}T${finalVisit.time || ''}`)) return '所有检查预约必须安排在专家看诊之前'
  return ''
}

export default function CheckupMedicalExecutionForm({ task, value, onChange }) {
  const data = checkupMedicalExecutionFromTask({ ...task, formData: value })
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const update = patch => onChange({ ...data, ...patch })
  const updateCheck = (index, patch) => update({ checkAppointments: data.checkAppointments.map((row, i) => i === index ? { ...row, ...patch } : row) })
  const upload = async (event, kind) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    setUploading(kind); setError('')
    try {
      const uploaded = await staffAPI.uploadReportFile(file, () => {})
      const result = await staffAPI.uploadReport({ patientId: patientIdOf(task), title: file.name.replace(/\.[^.]+$/, '') || (kind === 'report' ? '检查报告' : '门诊病历'), type: 'other', documentCategory: kind === 'report' ? 'physical_exam' : 'outpatient_record', hospital: data.intake.institution || '', date: data.booking?.postCheckExpertAppointment?.date || new Date().toISOString().slice(0, 10), fileUrl: uploaded.url, fileUrls: [uploaded.url], ossKey: uploaded.ossKey || '', ossKeys: uploaded.ossKey ? [uploaded.ossKey] : [], mimeType: uploaded.mimeType || file.type, fileSize: String(uploaded.fileSize || file.size) })
      const id = String(result.data?._id || result.data?.id || '')
      if (!id) throw new Error('上传后未返回资料编号')
      const key = kind === 'report' ? 'reportIds' : 'medicalRecordIds'
      update({ [key]: [...new Set([...(data[key] || []), id])] })
    } catch (err) { setError(err.message || '上传失败') } finally { setUploading('') }
  }
  const finalVisit = data.booking?.postCheckExpertAppointment || data.booking?.expertAppointment || {}
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 12, borderRadius: 9, background: '#FFF8ED', fontSize: 13, lineHeight: 1.7 }}><b>既定预约：</b>{data.intake.institution || '—'}<br />开检查单：{[data.booking?.orderFormAppointment?.date, data.booking?.orderFormAppointment?.time].filter(Boolean).join(' ') || '—'}　专家看诊：{[finalVisit.date, finalVisit.time].filter(Boolean).join(' ') || '—'}</section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><b>① 开检查单情况</b><label style={label}>开单状态 *<select className="form-control" value={data.examOrderStatus} onChange={e => update({ examOrderStatus: e.target.value })}><option value="">请选择</option><option value="completed">已完成开单</option><option value="adjusted">已调整项目</option></select></label><label style={label}>开单说明（选填）<textarea className="form-control" rows={2} value={data.examOrderNote} onChange={e => update({ examOrderNote: e.target.value })} /></label></section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><b>② 检查项目预约与执行</b><span style={{ fontSize: 12, color: '#65776F' }}>逐项记录预约；所有检查须早于最终专家看诊。健管专员已预约的特殊检查会直接带入。</span>{data.checkAppointments.map((row, index) => <div key={`${row.item}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, paddingTop: index ? 8 : 0, borderTop: index ? '1px solid #E8EFEB' : 0 }}><label style={label}>检查项目<input className="form-control" disabled value={row.item} /></label>{row.managerBooked && <span style={{ alignSelf: 'end', color: '#1E6B50', fontSize: 12 }}>健管专员已预约</span>}<label style={label}>院区 *<input className="form-control" disabled={row.managerBooked} value={row.campus} onChange={e => updateCheck(index, { campus: e.target.value })} /></label><label style={label}>科室 *<input className="form-control" disabled={row.managerBooked} value={row.department} onChange={e => updateCheck(index, { department: e.target.value })} /></label><label style={label}>日期 *<input type="date" className="form-control" disabled={row.managerBooked} value={row.appointmentDate} onChange={e => updateCheck(index, { appointmentDate: e.target.value })} /></label><label style={label}>时间 *<input type="time" className="form-control" disabled={row.managerBooked} value={row.appointmentTime} onChange={e => updateCheck(index, { appointmentTime: e.target.value })} /></label></div>)}</section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, background: '#F8FAF9', color: '#52685D', fontSize: 13, lineHeight: 1.7 }}><b>③ 后续自动跟进</b><br />保存本次开单与检查预约后，AI 将在检查完成后提醒客户上传检查报告和门诊病历，并同步健管专员审核。就医专员无需陪同、填写看诊记录或上传客户资料。</section>
  </div>
}
