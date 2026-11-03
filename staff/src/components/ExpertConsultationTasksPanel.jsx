import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAiWorkbench } from './AiWorkbenchProvider'
export default function ExpertConsultationTasksPanel() {
  const { data = [], loading, error, refresh } = useAiWorkbench()
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const tasks = data.filter(item => item.type === 'expert_consultation_task')
  const filtered = tasks.filter(item => [item.patientName, item.label, item.summary].some(value => String(value || '').includes(query.trim())))
  const current = Math.min(page, Math.max(0, Math.ceil(filtered.length / 10) - 1))
  return <section className="card" style={{ marginBottom: 20 }} aria-label="专家咨询与 MDT 待办">
    <div className="card-header"><h3 className="card-title">专家咨询与 MDT · {tasks.length} 项待办</h3></div>
    <div className="card-body">
      {error && <p role="alert">专家咨询待办刷新失败，保留上次结果。<button className="btn btn-secondary" onClick={refresh}>刷新待办</button></p>}
      {loading && <p>正在加载待办…</p>}
      {!!tasks.length && <input className="form-input" aria-label="搜索专家咨询待办" placeholder="搜索客户、任务或咨询内容" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} />}
      {!loading && !error && !filtered.length && <p>{query ? '没有匹配的咨询待办' : '暂无待您处理的专家咨询或 MDT 任务'}</p>}
      {filtered.slice(current * 10, current * 10 + 10).map(item => <button key={item.id} type="button" className="consultation-todo" onClick={() => nav(item.link)}><span className="consultation-todo-main"><strong>{item.patientName} · {item.label}</strong><span>{item.summary}</span></span><span>办理 →</span></button>)}
      {filtered.length > 10 && <div><button disabled={!current} onClick={() => setPage(current - 1)}>上一页</button> {current + 1} / {Math.ceil(filtered.length / 10)} <button disabled={(current + 1) * 10 >= filtered.length} onClick={() => setPage(current + 1)}>下一页</button></div>}
    </div>
  </section>
}
