import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupReportCollectionTask = task => task?.sourceType === 'health_plan'
  && task?.taskRole === 'executor'
  && task?.followUpSchemeId?.executorRole === 'healthManager'
  && /报告.*(?:回收|获取|归档)/.test(task?.followUpSchemeId?.name || task?.theme || '')

const patientIdOf = task => task?.patientId?._id || task?.patientId
const reportIdOf = report => String(report?._id || report?.id || '')

export default function CheckupReportCollectionForm({ task, value, onChange }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const patientId = patientIdOf(task)
  const onsite = task?.dependsOnTaskId || {}
  const onsiteRows = Array.isArray(onsite.serviceChecklist) ? onsite.serviceChecklist : []
  const appointment = onsiteRows[0]?.appointmentDetails || {}
  const saved = value?.find(item => item?.key === 'checkup_report_closure') || value?.[0] || {}
  const selectedIds = [...new Set([...(saved.reportIds || []), saved.reportId].filter(Boolean).map(String))]
  const upstreamActual = onsiteRows.map(item => [item.purpose, item.executionResult, item.nextAction].filter(Boolean).join('：')).filter(Boolean).join('\n')
  const closure = {
    key: 'checkup_report_closure', purpose: '核对体检执行情况并完成报告回收',
    serviceReviewed: Boolean(saved.serviceReviewed), actualSummary: saved.actualSummary || upstreamActual,
    temporaryItems: saved.temporaryItems || onsite.executedContent || '', missingReports: saved.missingReports || '',
    closureNotes: saved.closureNotes || '', collectionStatus: saved.collectionStatus || 'collecting',
    reportIds: selectedIds, reports: saved.reports || [], executionStatus: saved.collectionStatus === 'complete' ? 'completed' : 'partial',
    executionResult: saved.executionResult || '',
  }
  const change = patch => {
    const next = { ...closure, ...patch }
    next.executionStatus = next.collectionStatus === 'complete' ? 'completed' : 'partial'
    next.executionResult = next.collectionStatus === 'complete'
      ? `已核对体检执行情况并确认回收报告${next.reportIds.length}份，进入解析审核`
      : `已核对体检执行情况，当前回收报告${next.reportIds.length}份，继续跟进${next.missingReports ? `：${next.missingReports}` : ''}`
    next.reportId = next.reportIds[0] || ''
    onChange([next])
  }
  const load = async () => {
    if (!patientId) return
    setLoading(true); setError('')
    try { const result = await staffAPI.getReports({ patientId, limit: 30 }); setReports(result.data?.reports || []) }
    catch (err) { setError(err.message || '报告查询失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])
  const toggleReport = report => {
    const id = reportIdOf(report); const selected = selectedIds.includes(id)
    const reportIds = selected ? selectedIds.filter(item => item !== id) : [...selectedIds, id]
    const prior = closure.reports.filter(item => item.id !== id)
    change({ reportIds, reports: selected ? prior : [...prior, { id, title: report.title, createdAt: report.createdAt }] })
  }
  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    setUploading(true); setError('')
    try {
      const uploaded = await staffAPI.uploadReportFile(file, () => {})
      const result = await staffAPI.uploadReport({
        patientId, title: file.name.replace(/\.[^.]+$/, '') || '体检报告', type: 'annual', documentCategory: 'physical_exam',
        hospital: appointment.hospital || '', date: appointment.appointmentDate || new Date().toISOString().slice(0, 10),
        fileUrl: uploaded.url, fileUrls: [uploaded.url], ossKey: uploaded.ossKey || '', ossKeys: uploaded.ossKey ? [uploaded.ossKey] : [],
        mimeType: uploaded.mimeType || file.type, fileSize: String(uploaded.fileSize || file.size), planId: task?.sourceHealthPlanId?._id || task?.sourceHealthPlanId,
      })
      const report = result.data; const id = reportIdOf(report)
      change({ reportIds: [...selectedIds, id], reports: [...closure.reports.filter(item => item.id !== id), { id, title: report.title, createdAt: report.createdAt }] })
      await load()
    } catch (err) { setError(err.message || '报告上传失败') }
    finally { setUploading(false) }
  }
  return <div style={{ display: 'grid', gap: 12, flexShrink: 0 }}>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', background: '#F2F8F5', fontWeight: 750, color: '#29483C' }}>1. 查看预约与陪诊执行结果</div>
      <div style={{ padding: 14, display: 'grid', gap: 8, color: '#435A50', fontSize: 13 }}>
        <div><strong>预约信息：</strong>{[appointment.hospital, appointment.campus, appointment.appointmentDate, appointment.appointmentTime].filter(Boolean).join(' · ') || '未记录'}</div>
        <div><strong>原定特殊检查/专家：</strong>{[appointment.specialExams, appointment.expertArrangements].filter(Boolean).join('；') || '无单独记录'}</div>
        <div style={{ whiteSpace: 'pre-wrap' }}><strong>陪诊实际记录：</strong>{upstreamActual || onsite.executedContent || '陪诊人员未填写实际执行记录'}</div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', paddingTop: 4 }}><input type="checkbox" checked={closure.serviceReviewed} onChange={e => change({ serviceReviewed: e.target.checked })} /><span>我已查看就医专员记录，并核对实际完成、未完成及临时增加的检查或专家安排。</span></label>
      </div>
    </section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 750, color: '#29483C' }}>2. 核对实际检查与应回收报告</div>
      <label style={{ fontSize: 12, color: '#65776F' }}>实际完成的检查<textarea className="form-control" rows={3} value={closure.actualSummary} onChange={e => change({ actualSummary: e.target.value })} placeholder="根据陪诊记录核对并补充实际完成项目" style={{ marginTop: 5 }} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>临时检查、临时门诊或专家任务<textarea className="form-control" rows={2} value={closure.temporaryItems} onChange={e => change({ temporaryItems: e.target.value })} placeholder="如体检当日无临时任务可填写“无”" style={{ marginTop: 5 }} /></label>
      <label style={{ fontSize: 12, color: '#65776F' }}>尚缺报告及预计获取时间<textarea className="form-control" rows={2} value={closure.missingReports} onChange={e => change({ missingReports: e.target.value })} placeholder="例如：胃肠镜病理报告，预计7个工作日后获取" style={{ marginTop: 5 }} /></label>
    </section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', background: '#F2F8F5' }}><div style={{ fontWeight: 750, color: '#29483C' }}>3. 回收并关联体检报告</div><div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>可分批选择客户上传的报告或直接上传；报告未齐时保存进度，不结束服务。</div></div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><label className="btn btn-primary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>{uploading ? '上传中…' : '＋ 健管专员直接上传'}<input type="file" accept="image/*,.pdf" disabled={uploading} onChange={upload} style={{ display: 'none' }} /></label><button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? '查询中…' : '刷新客户上传记录'}</button></div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 230, overflowY: 'auto' }}>
          {!loading && reports.length === 0 && <div style={{ padding: 12, background: '#FFF8EB', color: '#B45309', borderRadius: 8 }}>暂未查询到报告，可以保存为“报告回收中”。</div>}
          {reports.map(report => { const id = reportIdOf(report); const selected = selectedIds.includes(id); return <button type="button" key={id} onClick={() => toggleReport(report)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selected ? '#1E6B50' : '#DDE5E0'}`, background: selected ? '#E8F5EF' : '#fff', color: '#1A2B24' }}><strong>{selected ? '✓ ' : ''}{report.title}</strong><div style={{ marginTop: 3, color: '#65776F', fontSize: 12 }}>{[report.hospital, String(report.checkDate || report.date || report.createdAt || '').slice(0, 10), report.uploadedBy ? '医护上传' : '客户上传'].filter(Boolean).join(' · ')}</div></button> })}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}><label><input type="radio" checked={closure.collectionStatus === 'collecting'} onChange={() => change({ collectionStatus: 'collecting' })} /> 报告回收中</label><label><input type="radio" checked={closure.collectionStatus === 'complete'} onChange={() => change({ collectionStatus: 'complete' })} /> 报告已齐全</label></div>
        <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#65776F' }}>闭环说明（选填）<textarea className="form-control" rows={2} value={closure.closureNotes} onChange={e => change({ closureNotes: e.target.value })} placeholder="缺页核验、追补经过、报告来源等" style={{ marginTop: 5 }} /></label>
        {error && <div style={{ marginTop: 8, color: '#DC3545', fontSize: 12 }}>{error}</div>}
      </div>
    </section>
  </div>
}
