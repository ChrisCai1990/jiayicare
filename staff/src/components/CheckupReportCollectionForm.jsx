import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'

export const isCheckupReportCollectionTask = task => task?.sourceType === 'health_plan'
  && task?.taskRole === 'executor'
  && task?.followUpSchemeId?.executorRole === 'healthManager'
  && /报告.*(?:回收|获取|归档)/.test(task?.followUpSchemeId?.name || task?.theme || '')

const patientIdOf = task => task?.patientId?._id || task?.patientId
const reportIdOf = report => String(report?._id || report?.id || '')

export default function CheckupReportCollectionForm({ task, plans = [], value, onChange }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [showHandoffDetails, setShowHandoffDetails] = useState(false)
  const patientId = patientIdOf(task)
  const onsite = task?.dependsOnTaskId || {}
  const onsiteRows = Array.isArray(onsite.serviceChecklist) ? onsite.serviceChecklist : []
  const appointment = onsiteRows[0]?.appointmentDetails || {}
  const saved = value?.find(item => item?.key === 'checkup_report_closure') || value?.[0] || {}
  const selectedIds = [...new Set([...(saved.reportIds || []), saved.reportId].filter(Boolean).map(String))]
  const checkupPlan = plans.filter(plan => plan?.type === 'annual_checkup' && plan?.confirmedAt)
    .sort((a, b) => String(b.confirmedAt || b.createdAt || '').localeCompare(String(a.confirmedAt || a.createdAt || '')))[0]
  const planItems = (checkupPlan?.items || []).filter(item => String(item?.name || '').trim())
  const savedChecks = new Map((saved.itemChecks || []).map(item => [String(item.key || item.itemId || item.name), item]))
  const itemChecks = planItems.map((item, index) => {
    const key = String(item._id || item.itemId || item.name || index)
    return { key, itemId: String(item._id || item.itemId || ''), name: item.name, status: 'awaiting_report', reportIds: [], ...(savedChecks.get(key) || {}) }
  })
  const sourcePlanId = String(task?.sourceHealthPlanId?._id || task?.sourceHealthPlanId || '')
  const checkupDate = String(appointment.appointmentDate || '').slice(0, 10)
  const currentReports = reports.filter(report => {
    const id = reportIdOf(report)
    if (selectedIds.includes(id)) return true
    const reportPlanId = String(report.sourceHealthPlanId?._id || report.sourceHealthPlanId || report.planId?._id || report.planId || '')
    if (sourcePlanId && reportPlanId === sourcePlanId) return true
    const reportDate = String(report.checkDate || report.date || report.createdAt || '').slice(0, 10)
    return Boolean(checkupDate && reportDate && reportDate >= checkupDate)
  })
  const upstreamActual = onsiteRows.map(item => [item.purpose, item.executionResult, item.nextAction].filter(Boolean).join('：')).filter(Boolean).join('\n')
  const closure = {
    key: 'checkup_report_closure', purpose: '核对体检执行情况并完成报告回收',
    serviceReviewed: Boolean(saved.serviceReviewed), actualSummary: saved.actualSummary || upstreamActual,
    temporaryItems: saved.temporaryItems || onsite.executedContent || '', missingReports: saved.missingReports || '',
    closureNotes: saved.closureNotes || '', collectionStatus: saved.collectionStatus || 'collecting',
    reportIds: selectedIds, reports: saved.reports || [], itemChecks, executionStatus: saved.collectionStatus === 'complete' ? 'completed' : 'partial',
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
    try { const result = await staffAPI.getReports({ patientId, limit: 100 }); setReports(result.data?.reports || []) }
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
  const updateItem = (key, patch) => change({ itemChecks: closure.itemChecks.map(item => item.key === key ? { ...item, ...patch } : item) })
  const applyReportToAll = report => {
    const id = reportIdOf(report)
    const reportIds = [...new Set([...selectedIds, id])]
    const reportSummary = [...closure.reports.filter(item => item.id !== id), { id, title: report.title, createdAt: report.createdAt }]
    change({ reportIds, reports: reportSummary, itemChecks: closure.itemChecks.map(item => ({ ...item, status: 'completed', reportIds: [...new Set([...(item.reportIds || []), id])] })) })
  }
  const upload = async (event, itemKey = '') => {
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
      const patch = {
        reportIds: [...new Set([...selectedIds, id])],
        reports: [...closure.reports.filter(item => item.id !== id), { id, title: report.title, createdAt: report.createdAt }],
      }
      if (itemKey) patch.itemChecks = closure.itemChecks.map(item => item.key === itemKey ? { ...item, status: 'completed', reportIds: [...new Set([...(item.reportIds || []), id])] } : item)
      change(patch)
      await load()
    } catch (err) { setError(err.message || '报告上传失败') }
    finally { setUploading(false) }
  }
  return <div style={{ display: 'grid', gap: 12, flexShrink: 0 }}>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', background: '#F2F8F5', fontWeight: 750, color: '#29483C' }}>1. 简单核对预约与陪诊</div>
      <div style={{ padding: 14, display: 'grid', gap: 10, color: '#435A50', fontSize: 13 }}>
        <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8FAF9' }}><strong>{appointment.hospital || '医院未记录'}</strong><span style={{ marginLeft: 10, color: '#65776F' }}>{[appointment.campus, appointment.appointmentDate, appointment.appointmentTime].filter(Boolean).join(' · ') || '预约时间未记录'}</span></div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={closure.serviceReviewed} onChange={e => change({ serviceReviewed: e.target.checked })} /><span>已查看并确认就医专员的体检日执行记录</span></label>
        <button type="button" className="btn btn-secondary" onClick={() => setShowHandoffDetails(show => !show)} style={{ justifySelf: 'start', padding: '5px 10px', fontSize: 12 }}>{showHandoffDetails ? '收起交接详情' : '查看交接详情'}</button>
        {showHandoffDetails && <div style={{ padding: 12, border: '1px solid #E2EAE6', borderRadius: 8, background: '#fff', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
          <div><strong>特殊检查/专家：</strong>{[appointment.specialExams, appointment.expertArrangements].filter(Boolean).join('；') || '无单独记录'}</div>
          <div style={{ marginTop: 6 }}><strong>陪诊记录：</strong>{upstreamActual || onsite.executedContent || '未填写'}</div>
        </div>}
      </div>
    </section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
      <div><div style={{ fontWeight: 750, color: '#29483C' }}>2. 按方案项目核对</div><div style={{ marginTop: 3, fontSize: 12, color: '#65776F' }}>单项报告可在项目旁上传并同步完成；未拿到报告时保留“报告待回收”。</div></div>
      {!planItems.length && <div style={{ padding: 10, borderRadius: 8, background: '#FFF8EB', color: '#B45309', fontSize: 12 }}>未读取到客户已确认的体检方案项目，请先核对方案。</div>}
      <div style={{ display: 'grid', gap: 7, maxHeight: 340, overflowY: 'auto' }}>
        {closure.itemChecks.map((item, index) => <div key={item.key} style={{ display: 'grid', gridTemplateColumns: '28px minmax(180px,1fr) auto auto', gap: 8, alignItems: 'center', padding: '8px 10px', border: '1px solid #E1EAE5', borderRadius: 8 }}>
          <span style={{ color: '#8AA89C', fontSize: 12 }}>{index + 1}</span><strong style={{ fontSize: 13 }}>{item.name}</strong>
          <select className="form-control" value={item.status} onChange={e => updateItem(item.key, { status: e.target.value })} style={{ width: 120, padding: '5px 7px', fontSize: 12 }}><option value="awaiting_report">报告待回收</option><option value="completed">已完成</option><option value="not_completed">未完成</option></select>
          <label className="btn btn-secondary" style={{ padding: '5px 9px', fontSize: 12, cursor: uploading ? 'wait' : 'pointer' }}>上传单项<input type="file" accept="image/*,.pdf" disabled={uploading} onChange={event => upload(event, item.key)} style={{ display: 'none' }} /></label>
        </div>)}
      </div>
      <details><summary style={{ cursor: 'pointer', color: '#65776F', fontSize: 12 }}>补充临时项目或缺失报告</summary><div style={{ marginTop: 8, display: 'grid', gap: 8 }}><label style={{ fontSize: 12, color: '#65776F' }}>临时增加<textarea className="form-control" rows={2} value={closure.temporaryItems} onChange={e => change({ temporaryItems: e.target.value })} placeholder="没有可填“无”" style={{ marginTop: 5 }} /></label><label style={{ fontSize: 12, color: '#65776F' }}>尚缺报告<textarea className="form-control" rows={2} value={closure.missingReports} onChange={e => change({ missingReports: e.target.value })} placeholder="例如：病理报告预计7个工作日后获取" style={{ marginTop: 5 }} /></label></div></details>
    </section>
    <section style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', background: '#F2F8F5' }}><div style={{ fontWeight: 750, color: '#29483C' }}>3. 回收并关联本次体检报告</div><div style={{ marginTop: 4, fontSize: 12, color: '#65776F' }}>这里只展示本次体检日期（{checkupDate || '待确认'}）及之后上传、或已关联到本服务方案的报告；客户既往健康资料不会混入。报告未齐时可保存进度，不结束服务。</div></div>
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><label className="btn btn-primary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>{uploading ? '上传中…' : '＋ 上传整份体检报告'}<input type="file" accept="image/*,.pdf" disabled={uploading} onChange={event => upload(event)} style={{ display: 'none' }} /></label><button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>{loading ? '查询中…' : '刷新客户上传记录'}</button></div>
        <div style={{ marginTop: 10, display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
          {!loading && currentReports.length === 0 && <div style={{ padding: 12, background: '#FFF8EB', color: '#B45309', borderRadius: 8 }}>暂未发现本次体检报告。请等待客户上传，或由健管专员直接上传；当前可保存为“报告回收中”。</div>}
          {currentReports.map(report => { const id = reportIdOf(report); const selected = selectedIds.includes(id); return <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: `1px solid ${selected ? '#1E6B50' : '#DDE5E0'}`, background: selected ? '#E8F5EF' : '#fff' }}><button type="button" onClick={() => toggleReport(report)} style={{ flex: 1, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#1A2B24' }}><strong>{selected ? '✓ ' : ''}{report.title}</strong><div style={{ marginTop: 3, color: '#65776F', fontSize: 12 }}>{[report.hospital || report.institution, String(report.checkDate || report.date || report.createdAt || '').slice(0, 10), report.uploadedBy ? '医护上传' : '客户上传'].filter(Boolean).join(' · ')}</div></button><button type="button" className="btn btn-secondary" onClick={() => applyReportToAll(report)} style={{ padding: '5px 9px', fontSize: 12 }}>整份覆盖全部项目</button></div> })}
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap' }}><label><input type="radio" checked={closure.collectionStatus === 'collecting'} onChange={() => change({ collectionStatus: 'collecting' })} /> 报告回收中</label><label><input type="radio" checked={closure.collectionStatus === 'complete'} onChange={() => change({ collectionStatus: 'complete' })} /> 报告已齐全</label></div>
        <label style={{ display: 'block', marginTop: 10, fontSize: 12, color: '#65776F' }}>闭环说明（选填）<textarea className="form-control" rows={2} value={closure.closureNotes} onChange={e => change({ closureNotes: e.target.value })} placeholder="缺页核验、追补经过、报告来源等" style={{ marginTop: 5 }} /></label>
        {error && <div style={{ marginTop: 8, color: '#DC3545', fontSize: 12 }}>{error}</div>}
      </div>
    </section>
  </div>
}
