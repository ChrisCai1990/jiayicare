import React, { useState } from 'react'
import { API_ORIGIN, staffAPI } from '../api'

export function normalizeServiceChecklist(value = [], purposes = [], source = []) {
  const saved = Array.isArray(value) ? value : []
  const executor = Array.isArray(source) ? source : []
  const base = executor.length ? executor : (saved.length ? saved : purposes.map((purpose, index) => ({ key: `purpose_${index}`, purpose })))
  return base.map((item, index) => ({ ...item, ...(saved.find(savedItem => savedItem.key === item.key) || {}), key: item.key || `purpose_${index}` }))
}

export function summarizeServiceChecklist(rows = [], mode = 'executor') {
  return rows.map((item, index) => mode === 'supervisor'
    ? `${index + 1}. ${item.purpose}：${item.supervisionStatus === 'verified' ? '核验通过' : '需补充'}${item.supervisionNote ? `（${item.supervisionNote}）` : ''}`
    : `${index + 1}. ${item.purpose}：${completionLabel[item.executionStatus] || '未填写'}${item.executionResult ? `；结果：${item.executionResult}` : ''}${item.nextAction ? `；下一步：${item.nextAction}` : ''}`
  ).join('\n')
}

const btn = active => ({ border: `1px solid ${active ? '#1E6B50' : '#D8DDD9'}`, background: active ? '#E8F5EF' : '#fff', color: active ? '#1E6B50' : '#65776F', borderRadius: 15, padding: '4px 9px', cursor: 'pointer', fontSize: 11 })
const completionLabel = { completed: '已完成', partial: '部分完成', incomplete: '未完成' }

const fileUrl = url => url?.startsWith('/') ? `${API_ORIGIN}${url}` : url

export function ChecklistAttachments({ item, index, mode, update, uploadLabel = '+ 上传对应检查单', errorLabel = '文件上传失败', emptyLabel = '未上传文件' }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const attachments = Array.isArray(item.attachments) ? item.attachments : []
  const upload = async event => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      const added = []
      for (const file of files) {
        const result = await staffAPI.uploadReportFile(file, () => {})
        added.push({ url: result.url, previewUrl: result.previewUrl || '', ossKey: result.ossKey || '', name: file.name, mimeType: result.mimeType || file.type, fileSize: String(result.fileSize || file.size || '') })
      }
      update(index, { attachments: [...attachments, ...added] })
    } catch (err) {
      setError(err.message || errorLabel)
    } finally {
      setUploading(false)
    }
  }
  return <div style={{ marginTop: 8 }}>
    {attachments.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {attachments.map((file, fileIndex) => <span key={`${file.url}-${fileIndex}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 7, background: '#F2F8F5', fontSize: 11 }}>
        <button type="button" onClick={() => setPreview(file)} style={{ padding: 0, border: 0, background: 'transparent', color: '#1E6B50', cursor: 'pointer', fontSize: 11 }}>{file.mimeType === 'application/pdf' ? '📄' : '🖼'} 查看：{file.name || `检查单${fileIndex + 1}`}</button>
        {mode === 'executor' && <button type="button" onClick={() => update(index, { attachments: attachments.filter((_, i) => i !== fileIndex) })} style={{ padding: 0, border: 0, background: 'transparent', color: '#DC3545', cursor: 'pointer' }}>×</button>}
      </span>)}
    </div>}
    {mode === 'executor' && <label style={{ display: 'inline-block', marginTop: attachments.length ? 7 : 0, padding: '5px 10px', border: '1px solid #BCD8CB', borderRadius: 7, color: '#1E6B50', background: '#fff', cursor: uploading ? 'wait' : 'pointer', fontSize: 11 }}>
      {uploading ? '上传中…' : uploadLabel}
      <input type="file" accept="image/*,.pdf" multiple disabled={uploading} onChange={upload} style={{ display: 'none' }} />
    </label>}
    {mode === 'supervisor' && attachments.length === 0 && <div style={{ color: '#8AA89C', fontSize: 11 }}>{emptyLabel}</div>}
    {error && <div style={{ marginTop: 5, color: '#DC3545', fontSize: 11 }}>{error}</div>}
    {preview && <div role="dialog" aria-modal="true" onClick={() => setPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(20,32,27,.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={event => event.stopPropagation()} style={{ width: 'min(1000px, 94vw)', height: 'min(820px, 90vh)', background: '#fff', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 18px 60px rgba(0,0,0,.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid #E7ECE9' }}>
          <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{preview.name || '检查单预览'}</strong>
          <a href={fileUrl(preview.previewUrl || preview.url)} download target="_blank" rel="noreferrer" style={{ color: '#1E6B50', fontSize: 12 }}>下载原文件</a>
          <button type="button" onClick={() => setPreview(null)} aria-label="关闭预览" style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 24, color: '#65776F', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F3F5F4', padding: preview.mimeType === 'application/pdf' ? 0 : 12 }}>
          {preview.mimeType === 'application/pdf'
            ? <iframe title={preview.name || '检查单PDF'} src={fileUrl(preview.previewUrl || preview.url)} style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
            : <img src={fileUrl(preview.previewUrl || preview.url)} alt={preview.name || '检查单'} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />}
        </div>
      </div>
    </div>}
  </div>
}

export default function ServiceTaskChecklist({ mode, purposes = [], value, source, onChange }) {
  const rows = normalizeServiceChecklist(value, purposes, source)
  const update = (index, patch) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  return (
    <div style={{ border: '1px solid #D8E7DF', borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ padding: '10px 12px', background: '#F2F8F5', color: '#29483C' }}>
        <div style={{ fontSize: 13, fontWeight: 750 }}>{mode === 'supervisor' ? '本次任务：核对代办结果与检查单' : '逐项目的完成记录'}</div>
        {mode === 'supervisor' && <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.6, color: '#65776F', fontWeight: 400 }}>逐项确认是否完成开单或预约、结果是否写清、检查单是否对应。本任务不收集检查结果或体检报告。</div>}
      </div>
      {rows.length === 0 && <div style={{ padding: 12, color: '#B45309', fontSize: 12 }}>方案尚未形成明确的代办目的，请先补充具体科室、专家及需要开具或领取的项目。</div>}
      {rows.map((item, index) => <div key={item.key} style={{ padding: 12, borderTop: index ? '1px solid #E8EFEB' : 'none', background: '#fff' }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.65, color: '#1A2B24' }}>{index + 1}. {item.purpose}</div>
        {mode === 'executor' ? <>
          {item.handoffSummary && <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 9, background: '#F2F8F5', color: '#29483C', fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}><strong>健康规划师预约交接</strong><div style={{ marginTop: 5 }}>{item.handoffSummary}</div></div>}
          {item.supervisionStatus === 'issue' && <div style={{ marginTop: 7, padding: '7px 9px', borderRadius: 7, background: '#FFF4E5', color: '#B45309', fontSize: 12 }}>督办退回：{item.supervisionNote || '请补充完成此项目'}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[['completed', '已完成'], ['partial', '部分完成'], ['incomplete', '未完成']].map(([key, label]) => <button key={key} type="button" style={btn(item.executionStatus === key)} onClick={() => update(index, { executionStatus: key })}>{label}</button>)}</div>
          <textarea className="form-control" rows={item.handoffSummary ? 5 : 2} value={item.executionResult || ''} onChange={e => update(index, { executionResult: e.target.value })} placeholder={item.handoffSummary ? '填写体检当日执行记录：完成项目、异常发现、临时增加的检查、临时门诊或专家安排及处理结果' : '填写实际结果：开具了哪些检查单、预约了哪位专家、领取了哪些资料'} style={{ marginTop: 8, minHeight: item.handoffSummary ? 130 : 74, resize: 'vertical', overflowY: 'auto', overscrollBehavior: 'contain' }} />
          <ChecklistAttachments item={item} index={index} mode={mode} update={update} />
          {item.executionStatus !== 'completed' && <input className="form-control" value={item.nextAction || ''} onChange={e => update(index, { nextAction: e.target.value })} placeholder="未完成原因、下一步及预计时间" style={{ marginTop: 7 }} />}
        </> : <>
          <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 8, background: '#F7F5F0', fontSize: 12, lineHeight: 1.6 }}><strong>代办结果：{completionLabel[item.executionStatus] || '未提交'}</strong>{item.executionResult && <div>{item.executionResult}</div>}{item.nextAction && <div style={{ color: '#B45309' }}>下一步：{item.nextAction}</div>}</div>
          <ChecklistAttachments item={item} index={index} mode={mode} update={update} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>{[['verified', '核验通过'], ['issue', '退回就医专员补充']].map(([key, label]) => <button key={key} type="button" style={btn(item.supervisionStatus === key)} onClick={() => update(index, { supervisionStatus: key })}>{item.supervisionStatus === key ? `✓ ${label}` : label}</button>)}</div>
          {item.supervisionStatus === 'issue' && <input className="form-control" value={item.supervisionNote || ''} onChange={e => update(index, { supervisionNote: e.target.value })} placeholder="需补充内容、责任人和期限" style={{ marginTop: 7 }} />}
        </>}
      </div>)}
    </div>
  )
}
