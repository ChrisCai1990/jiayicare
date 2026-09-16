import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupManagerReviewTask = task => task?.sourceType === 'order' && task?.workflowKey === 'checkup_appointment:manager_review'

const patientIdOf = task => task?.patientId?._id || task?.patientId
const label = { display: 'grid', gap: 5, fontSize: 12, color: '#65776F' }
const unique = values => [...new Set((values || []).map(String).filter(Boolean))]
const itemNames = medical => {
  const names = (medical?.checkAppointments || []).map(item => item.item).filter(Boolean)
  if (names.length) return unique(names)
  return unique((medical?.intake?.checkItems || medical?.booking?.intake?.checkItems || []).flatMap(item => String(item?.name || '').split(/[，,、]/)))
}

export const checkupManagerReviewFromTask = task => {
  const data = task?.formData || {}; const medical = data.medical || {}; const names = itemNames(medical)
  const reportAssignments = Object.fromEntries(names.map(name => [name, unique(data.reportAssignments?.[name])]))
  return { ...data, medical, reportAssignments, reportIds: unique(Object.values(reportAssignments).flat()), orphanReportIds: unique(data.orphanReportIds || (data.reportAssignments ? [] : data.reportIds)), medicalRecordIds: unique(data.medicalRecordIds), reviewSummary: data.reviewSummary || '', followUpContent: data.followUpContent || '' }
}

export const validateCheckupManagerReview = data => {
  const names = itemNames(data.medical || {})
  if (!names.length) return '未找到本次检查项目，请返回核对就医专员的预约信息'
  if (names.some(name => !data.reportAssignments?.[name]?.length)) return '请为每个检查项目分别上传或关联对应报告'
  if (!data.aiGenerated) return '请先由 AI 根据本次资料生成随访计划草稿'
  if (!data.reviewSummary.trim()) return '请填写资料审核结论'
  if (!data.followUpContent.trim()) return '请填写后续随访计划'
  return ''
}

export default function CheckupManagerReviewForm({ task, value, onChange, onOpenReport }) {
  const data = checkupManagerReviewFromTask({ ...task, formData: value })
  const [uploading, setUploading] = useState(''); const [generating, setGenerating] = useState(false); const [error, setError] = useState(''); const requested = useRef(false)
  const intake = data.medical?.intake || data.medical?.booking?.intake || {}; const booking = data.medical?.booking || {}; const checkItems = itemNames(data.medical)
  const update = patch => onChange({ ...data, ...patch })
  const updateAssignments = (assignments, orphanReportIds = data.orphanReportIds) => update({ reportAssignments: assignments, reportIds: unique(Object.values(assignments).flat()), orphanReportIds, aiGenerated: false })
  const upload = async (event, kind, item = '') => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return
    const key = `${kind}:${item}`; setUploading(key); setError('')
    try {
      const uploaded = await staffAPI.uploadReportFile(file, () => {})
      const result = await staffAPI.uploadReport({ patientId: patientIdOf(task), title: file.name.replace(/\.[^.]+$/, '') || item || (kind === 'record' ? '门诊病历' : '检查报告'), type: 'other', documentCategory: kind === 'record' ? 'outpatient_record' : 'physical_exam', hospital: intake.institution || '', date: booking.postCheckExpertAppointment?.date || new Date().toISOString().slice(0, 10), fileUrl: uploaded.url, fileUrls: [uploaded.url], ossKey: uploaded.ossKey || '', ossKeys: uploaded.ossKey ? [uploaded.ossKey] : [], mimeType: uploaded.mimeType || file.type, fileSize: String(uploaded.fileSize || file.size) })
      const id = String(result.data?._id || result.data?.id || ''); if (!id) throw new Error('上传后未返回资料编号')
      if (kind === 'record') update({ medicalRecordIds: unique([...data.medicalRecordIds, id]), aiGenerated: false })
      else updateAssignments({ ...data.reportAssignments, [item]: unique([...(data.reportAssignments[item] || []), id]) })
    } catch (err) { setError(err.message || '资料上传失败') } finally { setUploading('') }
  }
  const assignOrphan = (item, id) => { const assignments = Object.fromEntries(checkItems.map(name => [name, (data.reportAssignments[name] || []).filter(value => value !== id)])); assignments[item] = unique([...(assignments[item] || []), id]); updateAssignments(assignments, data.orphanReportIds.filter(value => value !== id)) }
  const generateDraft = async () => {
    const validation = validateCheckupManagerReview({ ...data, aiGenerated: true })
    if (validation && !/资料审核结论|后续随访计划/.test(validation)) { setError(validation); return }
    setGenerating(true); setError('')
    try { const result = await staffAPI.generateCheckupAppointmentFollowUpDraft(task._id, data); update({ reviewSummary: result.data.reviewSummary, followUpContent: result.data.followUpContent, followUpDate: result.data.followUpDate, aiGenerated: true }) } catch (err) { setError(err.message || 'AI生成随访计划失败') } finally { setGenerating(false) }
  }
  useEffect(() => { const complete = checkItems.length && checkItems.every(item => data.reportAssignments[item]?.length); if (requested.current || data.aiGenerated || !complete) return; requested.current = true; generateDraft() }, [data.aiGenerated, data.reportIds.length, checkItems.join('|')])
  const files = (ids, title) => <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', fontSize: 12 }}><span style={{ color: ids.length ? '#1E6B50' : '#B45309' }}>{ids.length ? `已关联 ${ids.length} 份` : '尚未上传'}</span>{ids.map((id, index) => <button key={id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, `${title} ${index + 1}`)}>查看资料 {index + 1}</button>)}</div>
  const uploader = (kind, title, description, ids, item = '') => <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 8 }}><div><b>{title} *</b><div style={{ fontSize: 12, color: '#65776F', marginTop: 3 }}>{description}</div></div><label className="btn btn-secondary" style={{ width: 'fit-content', cursor: uploading ? 'wait' : 'pointer' }}>{uploading === `${kind}:${item}` ? '上传中…' : `上传${title}`}<input type="file" accept="image/*,.pdf" disabled={!!uploading} onChange={event => upload(event, kind, item)} style={{ display: 'none' }} /></label>{files(ids, title)}</section>
  return <div style={{ display: 'grid', gap: 14 }}>
    <section style={{ padding: 12, borderRadius: 9, background: '#FFF8ED', fontSize: 13, lineHeight: 1.7 }}><b>资料收集与审核：</b>{intake.institution || '检查机构待确认'}<br />检查报告必须逐项对应本次检查项目；报告与门诊病历齐全后，AI 自动生成随访计划草稿并转健康顾问审核。</section>
    <section style={{ display: 'grid', gap: 10 }}><b>检查报告（逐项对应）</b>{checkItems.map(item => uploader('report', `${item}报告`, '上传并核对该检查项目对应的报告。', data.reportAssignments[item] || [], item))}</section>
    {data.orphanReportIds.length > 0 && <section style={{ border: '1px solid #E8D7AE', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: '#FFFCF5' }}><b>待归属的历史检查报告</b><div style={{ fontSize: 12, color: '#7B6840' }}>请将历史上传的资料归入具体检查项目后再生成随访计划。</div>{data.orphanReportIds.map((id, index) => <div key={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, `历史检查报告 ${index + 1}`)}>查看资料 {index + 1}</button>{checkItems.map(item => <button key={item} type="button" className="btn btn-sm" onClick={() => assignOrphan(item, id)}>归入{item}</button>)}</div>)}</section>}
    {uploader('record', '门诊病历（选填）', '客户如有本次专家看诊病历或病程记录，可在此上传；缺失不阻断审核。', data.medicalRecordIds)}
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 13, display: 'grid', gap: 10 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><b>AI 随访计划草稿</b><button type="button" className="btn btn-secondary btn-sm" disabled={generating} onClick={generateDraft}>{generating ? 'AI生成中…' : data.aiGenerated ? '重新生成草稿' : '生成随访计划草稿'}</button></div><div style={{ fontSize: 12, color: '#65776F' }}>AI 仅依据已逐项归属的检查报告及可选病历生成草稿；健管专员核对后提交健康顾问审核。</div><label style={label}>资料审核结论 *<textarea className="form-control" rows={3} value={data.reviewSummary} onChange={e => update({ reviewSummary: e.target.value })} placeholder="AI将根据资料自动生成，可人工补充" /></label><label style={label}>后续随访计划 *<textarea className="form-control" rows={3} value={data.followUpContent} onChange={e => update({ followUpContent: e.target.value })} placeholder="AI将根据资料自动生成，健康顾问审核后服务结束" /></label></section>
    {error && <div style={{ color: '#B42318', fontSize: 12 }}>{error}</div>}
  </div>
}
