import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { staffAPI, getToken } from '../api'
import useWorkbenchResource from '../hooks/useWorkbenchResource'
import { useWorkbenchReminder } from '../components/WorkbenchReminder'
import { feedbackState, feedbackStateLabel } from '../../../shared/feedbackWorkflow.cjs'

export default function FeedbackPage() {
  const reminder = useWorkbenchReminder()
  const [params, setParams] = useSearchParams()
  const [showHistory, setShowHistory] = useState(false)
  const [page, setPage] = useState(1)
  const item = params.get('item') || ''
  const resource = useWorkbenchResource(() => staffAPI.getAssignedFeedback({ history: showHistory ? '1' : '0', page, ...(item ? { item } : {}) }), `${getToken()}:${showHistory}:${page}:${item}`, { data: [], total: 0 })
  const [editing, setEditing] = useState(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const rows = resource.data.data || []
  const submit = async () => {
    if (saving) return
    setSaving(true); setError('')
    try {
      if (!result.trim()) throw new Error('请填写已采取的措施及处理结果')
      await staffAPI.submitFeedbackResult(editing._id, { result: result.trim(), version: editing.workflowVersion || 0 })
      setEditing(null); setResult(''); setNotice('处理结果已交管理员核对，尚未发送给客户。')
      await resource.refresh(); reminder.refresh()
    } catch (err) { setError(err.message || '提交失败') }
    finally { setSaving(false) }
  }
  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">分派给我的反馈</h1><p>请提交处理结果，由管理员核对后统一回复客户。</p></div><button className="btn" disabled={saving} onClick={resource.refresh}>刷新</button></div>
    <label><input type="checkbox" checked={showHistory} onChange={e => { setShowHistory(e.target.checked); setPage(1); setParams({}); setEditing(null) }} /> 显示已提交和已完成记录</label>
    {item && <button className="btn" onClick={() => { setParams({}); setPage(1); setEditing(null) }}>返回我的反馈列表</button>}
    {resource.error && <p role="alert" style={{ color: '#B42318' }}>{resource.error}</p>}
    {notice && <p role="status" style={{ color: '#176547' }}>{notice}</p>}
    {resource.loading ? <p>正在加载…</p> : !rows.length && !resource.error && <div className="card" style={{ padding: 24 }}>暂无分派给你的待处理反馈。</div>}
    {rows.map(row => <section className="card" key={row._id} style={{ padding: 20, marginTop: 16, border: String(row._id) === params.get('item') ? '2px solid #1E6B50' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}><strong>{row.type}</strong><span>{feedbackStateLabel[feedbackState(row)]}</span></div>
      <p style={{ fontSize: 12, color: '#64736C' }}>分派时间：{row.assignedAt ? new Date(row.assignedAt).toLocaleString('zh-CN') : '—'}</p>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content}</p>
      {row.assignmentNote && <p style={{ whiteSpace: 'pre-wrap' }}><strong>管理员处理要求：</strong>{row.assignmentNote}</p>}
      {row.handlingResult && <p style={{ whiteSpace: 'pre-wrap' }}><strong>已提交结果：</strong>{row.handlingResult}</p>}
      {row.reply && <p style={{ whiteSpace: 'pre-wrap' }}><strong>管理员最终回复：</strong>{row.reply}</p>}
      {feedbackState(row) === 'assigned' && editing?._id !== row._id && <button className="btn btn-primary" disabled={saving} onClick={() => { setEditing(row); setResult(''); setError(''); setNotice('') }}>填写处理结果</button>}
      {editing?._id === row._id && <div style={{ background: '#F4F7F5', padding: 16 }}>
        <label>处理措施与结果（仅内部可见）<textarea aria-label="处理措施与结果" rows={5} maxLength={5000} value={result} disabled={saving} onChange={e => setResult(e.target.value)} style={{ display: 'block', width: '100%', padding: 10, marginTop: 8 }} /></label>
        {error && <p role="alert" style={{ color: '#B42318' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary" disabled={saving} onClick={submit}>{saving ? '提交中…' : '提交管理员核对'}</button><button className="btn" disabled={saving} onClick={() => setEditing(null)}>取消</button></div>
      </div>}
    </section>)}
    {!item && <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}><button className="btn" disabled={page <= 1 || saving} onClick={() => { setPage(page - 1); setEditing(null) }}>上一页</button><span>共 {resource.data.total || 0} 条 · 第 {page} 页</span><button className="btn" disabled={page * 50 >= (resource.data.total || 0) || saving} onClick={() => { setPage(page + 1); setEditing(null) }}>下一页</button></div>}
  </div>
}
