import React, { useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupManagerReviewTask = task => task?.sourceType === 'order' && task?.workflowKey === 'checkup_appointment:manager_review'

const patientIdOf = task => task?.patientId?._id || task?.patientId
const label = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }

export const checkupManagerReviewFromTask = task => {
  const data = task?.formData || {}
  const medical = data.medical || {}
  return {
    ...data,
    medical,
    reportIds: Array.isArray(data.reportIds) ? data.reportIds : [],
    medicalRecordIds: Array.isArray(data.medicalRecordIds) ? data.medicalRecordIds : [],
    reviewSummary: data.reviewSummary || '',
    followUpContent: data.followUpContent || '',
  }
}

export const validateCheckupManagerReview = data => {
  if (!data.reportIds?.length) return '请上传或关联至少一份检查报告'
  if (!data.medicalRecordIds?.length) return '请上传或关联至少一份门诊病历'
  if (!data.reviewSummary.trim()) return '请填写资料审核结论'
  if (!data.followUpContent.trim()) return '请填写后续随访计划'
  return ''
}

export default function CheckupManagerReviewForm({ task, value, onChange }) {
  const data = checkupManagerReviewFromTask({ ...task, formData: value })
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const update = patch => onChange({ ...data, ...patch })
  const intake = data.medical?.intake || data.medical?.booking?.intake || {}
  const booking = data.medical?.booking || {}
  const upload = async (event, kind) => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setUploading(kind); setError('')
    try {
      const uploaded = await staffAPI.uploadReportFile(file, () => {})
      const result = await staffAPI.uploadReport({
        patientId: patientIdOf(task), title: file.name.replace(/\.[^.]+$/, '') || (kind === 'report' ? '检查报告' : '门诊病历'), type: 'other',
        documentCategory: kind === 'report' ? 'physical_exam' : 'outpatient_record', hospital: intake.institution || '',
        date: booking.postCheckExpertAppointment?.date || new Date().toISOString().slice(0, 10), fileUrl: uploaded.url, fileUrls: [uploaded.url],
        ossKey: uploaded.ossKey || '', ossKeys: uploaded.ossKey ? [uploaded.ossKey] : [], mimeType: uploaded.mimeType || file.type, fileSize: String(uploaded.fileSize || file.size),
      })
      const id = String(result.data?._id || result.data?.id || '')
      if (!id) throw new Error('上传后未返回资料编号')
      const key = kind === 'report' ? 'reportIds' : 'medicalRecordIds'
      update({ [key]: [...new Set([...(data[key] || []), id])] })
    } catch (err) { setError(err.message || '资料上传失败') } finally { setUploading('') }
  }
  const uploader = (kind, title, description, ids) => <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 8 }}>
    <div><b>{title} *</b><div style={{ fontSize: 12, color: '#65776F', marginTop: 3 }}>{description}</div></div>
    <label className="btn btn-secondary" style={{ width: 'fit-content', cursor: uploading ? 'wait' : 'pointer' }}>{uploading === kind ? '上传中…' : `上传${title}`}<input type="file" accept="image/*,.pdf" disabled={!!uploading} onChange={event => upload(event, kind)} style={{ display: 'none' }} /></label>
    <div style={{ fontSize: 12, color: ids.length ? '#1E6B50' : '#B45309' }}>{ids.length ? `已关联 ${ids.length} 份` : '尚未上传'}</div>
  </section>
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 12, borderRadius: 9, background: '#FFF8ED', fontSize: 13, lineHeight: 1.7 }}><b>资料收集与审核：</b>{intake.institution || '检查机构待确认'}<br />客户检查完成后由 AI 提醒上传；健管专员在此补充或关联检查报告和门诊病历，再生成后续随访计划。</section>
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{uploader('report', '检查报告', '可上传检验、影像或检查报告。', data.reportIds)}{uploader('record', '门诊病历', '上传本次专家看诊病历或病程记录。', data.medicalRecordIds)}</section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><b>资料审核与随访计划</b><label style={label}>审核结论 *<textarea className="form-control" rows={3} value={data.reviewSummary} onChange={e => update({ reviewSummary: e.target.value })} placeholder="核对报告和病历是否齐全、归属是否正确，以及需关注的事项" /></label><label style={label}>后续随访计划 *<textarea className="form-control" rows={3} value={data.followUpContent} onChange={e => update({ followUpContent: e.target.value })} placeholder="填写后续随访主题、频次或复查安排；将转健康顾问审核" /></label></section>
    {error && <div style={{ color: '#B42318', fontSize: 12 }}>{error}</div>}
  </div>
}
