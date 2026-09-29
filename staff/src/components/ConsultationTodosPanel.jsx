import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'

export default function ConsultationTodosPanel() {
  const nav = useNavigate()
  const [items, setItems] = useState([]), [error, setError] = useState(''), [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  useEffect(() => {
    let alive = true, running = false
    const refresh = async () => {
      if (running || document.visibilityState === 'hidden') return
      running = true
      try { const response = await staffAPI.getConsultationTodos(); if (alive) { setItems(response.data || []); setError('') } }
      catch (e) { if (alive) setError(e.message || '咨询待办加载失败') }
      finally { running = false; if (alive) setLoading(false) }
    }
    refresh()
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener('consultation-retry', refresh)
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('consultation-retry', refresh) }
  }, [])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(items.length / 10) - 1))
  return <section className="card" style={{ marginBottom: 20 }} aria-label="官网咨询与服务跟进待办">
    <div className="card-header"><div className="card-title">官网咨询与服务跟进 · {items.length} 项 · {items.filter(i => i.overdue).length} 项逾期</div>
      <button className="btn btn-secondary btn-sm" onClick={() => nav('/visitor-leads')}>全部咨询</button></div>
    <div className="card-body">
      {error && <p role="alert">{error} <button onClick={() => window.dispatchEvent(new Event('consultation-retry'))}>重试</button></p>}
      {loading ? <p>加载中...</p> : !error && !items.length && <p>暂无待联系或待跟进事项。</p>}
      {items.slice(currentPage * 10, currentPage * 10 + 10).map(item => <button key={item.id} type="button" onClick={() => nav(item.link)}
        style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid #eee', background: 'none', padding: 12, cursor: 'pointer' }}>
        <strong>{item.overdue ? '逾期 · ' : ''}{item.label} · {item.name}</strong><div>{item.summary}</div>
        <small>跟进期限：{item.dueAt ? new Date(item.dueAt).toLocaleString('zh-CN') : '待核对'}</small>
      </button>)}
      {items.length > 10 && <div><button disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一页</button>
        <span> {currentPage + 1} / {Math.ceil(items.length / 10)} </span>
        <button disabled={(currentPage + 1) * 10 >= items.length} onClick={() => setPage(currentPage + 1)}>下一页</button></div>}
    </div>
  </section>
}
