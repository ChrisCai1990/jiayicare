import React, { useEffect, useRef, useState } from 'react'
import { adminAPI } from '../api'
import { feedbackState, feedbackStateLabel } from '../../../shared/feedbackWorkflow.cjs'

const fmt = value => value ? new Date(value).toLocaleString('zh-CN') : '—'
const actionLabel = { assign: '分派／转交', submit: '提交处理结果', close: '核对并回复客户' }

export default function FeedbackPage() {
  const [list, setList] = useState([])
  const [people, setPeople] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState('unassigned')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [person, setPerson] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef(0)
  const load = async () => {
    const revision = ++request.current
    setLoading(true); setError('')
    try {
      const res = await adminAPI.feedbackList({ page, ...(stage === 'closed' ? { status: 'resolved' } : stage ? { stage } : {}) })
      if (revision === request.current) { setList(res.data || []); setTotal(res.total || 0) }
    } catch (err) { if (revision === request.current) setError(err.message || '加载失败') }
    finally { if (revision === request.current) setLoading(false) }
  }
  useEffect(() => { load(); return () => { request.current++ } }, [page, stage])
  useEffect(() => { adminAPI.feedbackAssignees().then(res => setPeople(res.data || [])).catch(err => setError(err.message)) }, [])
  const begin = (row, mode) => {
    setEditing({ row, mode }); setPerson(String(row.assignedTo || '')); setNote(mode === 'reply' ? row.reply || '' : ''); setFormError(''); setNotice('')
  }
  const save = async () => {
    if (saving) return
    setSaving(true); setFormError('')
    try {
      const { row, mode } = editing
      if (mode === 'assign') {
        if (!person) throw new Error('请选择负责人')
        await adminAPI.assignFeedback(row._id, { assignedTo: person, note, version: row.workflowVersion || 0 })
        setNotice('已分派，负责人的工作台会自动显示待办。')
      } else {
        if (!note.trim()) throw new Error('请填写给客户的回复')
        await adminAPI.replyFeedback(row._id, note.trim(), row.workflowVersion || 0)
        setNotice('已完成核对并回复，客户可在反馈记录中查看。')
      }
      setEditing(null); await load()
    } catch (err) { setFormError(err.message || '保存失败') }
    finally { setSaving(false) }
  }
  return <>
    <div className="page-header"><div><h1 className="page-title">用户反馈</h1><p className="page-sub">管理员统一分派 → 负责人提交结果 → 管理员核对并回复</p></div><button className="btn" disabled={loading || saving} onClick={load}>刷新列表</button></div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {[['unassigned', '待分派'], ['assigned', '处理中'], ['submitted', '待核对'], ['closed', '已完成'], ['', '全部']].map(([value, label]) => <button key={value} className={`btn btn-sm ${stage === value ? 'btn-primary' : ''}`} onClick={() => { setStage(value); setPage(1); setEditing(null) }} disabled={saving}>{label}</button>)}
    </div>
    {error && <div role="alert" style={{ color: '#B42318', padding: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 12, color: '#176547' }}>{notice}</div>}
    {loading ? <div className="card" style={{ padding: 24 }}>正在加载反馈…</div> : <>
      {!error && list.length === 0 && <div className="card" style={{ padding: 32 }}>当前分类暂无反馈。</div>}
      {list.map(row => <section key={row._id} className="card" style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><strong>{row.type} · {row.user?.name || '用户资料已移除'}</strong><span>{feedbackStateLabel[feedbackState(row)]}</span></div>
        <p style={{ fontSize: 12, color: '#64736C' }}>{fmt(row.createdAt)} {row.user?.phone && ` · ${row.user.phone}`}</p>
        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.content}</p>
        {row.assignedTo && <div style={{ background: '#F4F7F5', padding: 12, margin: '12px 0' }}><strong>负责人：{row.assignedName}</strong><div style={{ whiteSpace: 'pre-wrap' }}>内部处理要求：{row.assignmentNote || '无补充要求'}</div></div>}
        {row.handlingResult && <div style={{ padding: 12, borderLeft: '3px solid #D99D2A', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><strong>负责人处理结果（仅内部可见）</strong><p>{row.handlingResult}</p><small>{fmt(row.resultAt)}</small></div>}
        {row.reply && <p style={{ whiteSpace: 'pre-wrap' }}><strong>客户收到的回复：</strong>{row.reply}</p>}
        {feedbackState(row) !== 'closed' && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn" disabled={saving} onClick={() => begin(row, 'assign')}>{row.assignedTo ? '转交／退回补充' : '分派负责人'}</button>
          {feedbackState(row) === 'submitted' && <button className="btn btn-primary" disabled={saving} onClick={() => begin(row, 'reply')}>核对并回复客户</button>}
        </div>}
        {editing?.row._id === row._id && <div style={{ marginTop: 16, padding: 16, background: '#F4F7F5' }}>
          {editing.mode === 'assign' && <label>负责人<select aria-label="负责人" value={person} onChange={e => setPerson(e.target.value)} disabled={saving} style={{ display: 'block', margin: '8px 0', maxWidth: '100%', minWidth: 240 }}><option value="">请选择已启用员工</option>{people.map(p => <option key={p._id} value={p._id}>{p.name}{p.department ? ` · ${p.department}` : ''}{p.title ? ` · ${p.title}` : ''}</option>)}</select></label>}
          <label>{editing.mode === 'assign' ? '内部处理要求（不会发给客户）' : '给客户的回复'}<textarea aria-label={editing.mode === 'assign' ? '内部处理要求' : '给客户的回复'} value={note} maxLength={editing.mode === 'assign' ? 2000 : 5000} rows={4} disabled={saving} onChange={e => setNote(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 8, padding: 10 }} /></label>
          {editing.mode === 'assign' && row.assignedTo && <p>选择原负责人可退回补充；先前的处理结果会保留在操作记录中。</p>}
          {formError && <p role="alert" style={{ color: '#B42318' }}>{formError}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中…' : editing.mode === 'assign' ? '确认分派' : '确认回复并完成'}</button><button className="btn" disabled={saving} onClick={() => setEditing(null)}>取消</button></div>
        </div>}
        {!!row.workflowHistory?.length && <details style={{ marginTop: 16 }}><summary>内部操作记录（{row.workflowHistory.length}）</summary>{row.workflowHistory.map((event, i) => <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #E5EBE7', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><small>{fmt(event.at)} · {event.actorName} · {actionLabel[event.action]} {event.assigneeName && `→ ${event.assigneeName}`}</small><div>{event.note}</div></div>)}</details>}
      </section>)}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}><button className="btn" disabled={page <= 1 || saving} onClick={() => setPage(page - 1)}>上一页</button><span>共 {total} 条 · 第 {page} 页</span><button className="btn" disabled={page * 50 >= total || saving} onClick={() => setPage(page + 1)}>下一页</button></div>
    </>}
  </>
}
