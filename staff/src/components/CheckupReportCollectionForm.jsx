import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupReportCollectionTask = task => task?.sourceType === 'health_plan'
  && task?.taskRole === 'executor'
  && task?.followUpSchemeId?.executorRole === 'healthManager'
  && /报告.*(?:回收|获取|归档)/.test(task?.followUpSchemeId?.name || task?.theme || '')

const patientIdOf = task => task?.patientId?._id || task?.patientId

export default function CheckupReportCollectionForm({ task, value, onChange }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const patientId = patientIdOf(task)
  const appointment = task?.dependsOnTaskId?.serviceChecklist?.[0]?.appointmentDetails || {}
  const selectedId = value?.[0]?.reportId || ''

  const load = async () => {
    if (!patientId) return
    setLoading(true)
    try {
      const result = await staffAPI.getReports({ patientId, limit: 20 })
      setReports(result.data?.reports || [])
    } catch (err) { setError(err.message || '报告查询失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])

  const selectReport = report => onChange([{
    key: 'checkup_report_received', purpose: '确认本次体检报告已回收并进入解析流程',
    executionStatus: 'completed', executionResult: `已确认报告：${report.title}`,
    reportId: report._id, reportTitle: report.title, reportCreatedAt: report.createdAt,
  }])

  const upload = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true); setError('')
    try {
      const uploaded = await staffAPI.uploadReportFile(file, () => {})
      const reportResult = await staffAPI.uploadReport({
        patientId, title: file.name.replace(/\.[^.]+$/, '') || '体检报告', type: 'annual',
        documentCategory: 'physical_exam', hospital: appointment.hospital || '',
        date: appointment.appointmentDate || new Date().toISOString().slice(0, 10),
        fileUrl: uploaded.url, fileUrls: [uploaded.url], ossKey: uploaded.ossKey || '',
        ossKeys: uploaded.ossKey ? [uploaded.ossKey] : [], mimeType: uploaded.mimeType || file.type,
        fileSize: String(uploaded.fileSize || file.size), planId: task?.sourceHealthPlanId?._id || task?.sourceHealthPlanId,
      })
      selectReport(reportResult.data)
      await load()
    } catch (err) { setError(err.message || '报告上传失败') }
    finally { setUploading(false) }
  }

  return <div style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
    <div style={{ padding: '12px 14px', background: '#F2F8F5' }}>
      <div style={{ fontSize: 14, fontWeight: 750, color: '#29483C' }}>体检报告回收</div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>确认客户已上传的报告，或由健管专员直接上传。确认后报告进入待解析队列。</div>
    </div>
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn btn-primary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
          {uploading ? '上传中…' : '＋ 健管专员直接上传报告'}
          <input type="file" accept="image/*,.pdf" disabled={uploading} onChange={upload} style={{ display: 'none' }} />
        </label>
        <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? '查询中…' : '刷新客户上传记录'}</button>
      </div>
      <div style={{ marginTop: 14, fontSize: 12, fontWeight: 700, color: '#4A6558' }}>客户近期报告（请选择本次体检报告）</div>
      <div style={{ marginTop: 8, display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
        {!loading && reports.length === 0 && <div style={{ padding: 14, borderRadius: 8, background: '#FFF8EB', color: '#B45309' }}>尚未查询到客户上传的报告，可稍后刷新或由健管专员直接上传。</div>}
        {reports.map(report => <button type="button" key={report._id} onClick={() => selectReport(report)} style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${selectedId === report._id ? '#1E6B50' : '#DDE5E0'}`, background: selectedId === report._id ? '#E8F5EF' : '#fff', color: '#1A2B24' }}>
          <strong>{selectedId === report._id ? '✓ ' : ''}{report.title}</strong>
          <div style={{ marginTop: 4, color: '#65776F', fontSize: 12 }}>{[report.hospital, String(report.checkDate || report.date || report.createdAt || '').slice(0, 10), report.uploadedBy ? '医护上传' : '客户上传'].filter(Boolean).join(' · ')}</div>
        </button>)}
      </div>
      {selectedId && <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: 8, background: '#E8F5EF', color: '#1E6B50', fontSize: 12 }}>已确认报告，保存后将完成回收并进入解析审核流程。</div>}
      {error && <div style={{ marginTop: 10, color: '#DC3545', fontSize: 12 }}>{error}</div>}
    </div>
  </div>
}
