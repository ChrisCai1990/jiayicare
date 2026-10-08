import React, { useEffect, useMemo, useState } from 'react'
import { getSpecialtyLibrary } from '../api'

export default function SpecialtyLibraryPage() {
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { getSpecialtyLibrary().then(result => setItems(result.data || [])).catch(e => setError(e.message)) }, [])
  const filtered = useMemo(() => items.filter(item => `${item.title} ${item.diseases?.join(' ')} ${item.overview}`.toLowerCase().includes(query.toLowerCase())), [items, query])
  const current = filtered.find(item => item._id === selected) || filtered[0]
  const block = (title, value) => value ? <section style={{ padding: '14px 0', borderBottom: '1px solid #E7EFEB' }}><div style={{ fontWeight: 700, marginBottom: 6 }}>{title}</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{value}</div></section> : null
  return <div>
    <div className="page-header"><div><div className="page-title">专病管理库</div><div className="page-subtitle">查看本机构发布的标准服务路径。客户实际管理方案以健康顾问确认的专科意见为准。</div></div></div>
    <div style={{ padding: 12, borderRadius: 8, background: '#EFF8F4', color: '#1E6B50', marginBottom: 16 }}>这里是团队工作参考，不会生成客户待办。客户改期、病情变化或专家停诊时，由健康顾问协调调整实际方案。</div>
    {error && <div style={{ color: '#B42318', marginBottom: 12 }}>{error}</div>}
    <input className="form-input" style={{ width: 'min(100%, 420px)', marginBottom: 16 }} value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索专病名称或适用类型" />
    {!filtered.length ? <div className="card"><div className="card-body" style={{ padding: 32, textAlign: 'center' }}>暂无已发布的专病路径。</div></div> : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px, .7fr) minmax(360px, 1.5fr)', gap: 16, alignItems: 'start' }}><div className="card"><div className="card-body" style={{ padding: 8 }}>{filtered.map(item => <button key={item._id} onClick={() => setSelected(item._id)} style={{ display: 'block', width: '100%', padding: 12, textAlign: 'left', border: 0, borderBottom: '1px solid #E7EFEB', background: current?._id === item._id ? '#EFF8F4' : '#fff', cursor: 'pointer' }}><strong>{item.title}</strong><div style={{ marginTop: 4, color: '#60776C', fontSize: 12 }}>{item.diseases?.join('、')} · v{item.version}</div></button>)}</div></div><div className="card"><div className="card-body"><h2 style={{ marginTop: 0 }}>{current.title} <small style={{ fontSize: 13, color: '#60776C' }}>v{current.version}</small></h2><div style={{ color: '#60776C', fontSize: 12 }}>发布于 {current.publishedAt ? new Date(current.publishedAt).toLocaleDateString('zh-CN') : '-'}</div>
      {block('适用类型', current.diseases?.join('、'))}{block('服务概述', current.overview)}{block('服务边界', current.serviceBoundary)}{block('岗位职责与交接', current.roles)}
      <section style={{ padding: '14px 0', borderBottom: '1px solid #E7EFEB' }}><div style={{ fontWeight: 700, marginBottom: 10 }}>标准服务阶段</div>{current.stages?.map((stage, index) => <div key={index} style={{ padding: '10px 12px', marginBottom: 8, background: '#F7FAF9', borderRadius: 8 }}><b>{index + 1}. {stage.title}</b><div style={{ marginTop: 5, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{stage.purpose}</div><div style={{ marginTop: 5, color: '#60776C', fontSize: 13 }}>责任：{stage.owner || '-'} · 启动：{stage.trigger || '-'}</div>{stage.handoff && <div style={{ marginTop: 4, fontSize: 13 }}>交接：{stage.handoff}</div>}</div>)}</section>
      {block('客户日常记录参考', current.diaryGuide)}{block('延误与异常处理', current.exceptionGuide)}{block('来源与审核备注', current.sourceNote)}{block('临床审核人', current.clinicalReviewer)}
    </div></div></div>}
  </div>
}
