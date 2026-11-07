import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import './AiWorkspacePage.css'

const MODES = [
  { key: 'free', title: '自由探讨', detail: '与通义千问讨论思路' },
  { key: 'knowledge', title: '知识库分析', detail: '待接入正式资料', disabled: true },
  { key: 'reply', title: '客户回复草稿', detail: '只输入模拟客户消息' },
]
const IDEAS = {
  free: ['如何让首次健康咨询的流程更清晰？', '年度健康管理方案该如何向团队解释？', '哪些工作适合先让 AI 辅助？'],
  reply: ['模拟客户问：专家约诊能保证约到指定专家吗？', '模拟客户问：年度健康管理计划具体能帮我做什么？', '模拟客户问：体检服务有哪些需要提前确认的条件？'],
}

function readSessions(key) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key))
    return Array.isArray(value) ? value.filter(s => s && ['free', 'reply'].includes(s.mode) && Array.isArray(s.messages)).slice(0, 20) : []
  } catch { return [] }
}

export default function AiWorkspacePage() {
  const { staff } = useStaff()
  return <AiWorkspaceContent key={staff?._id || staff?.id || 'unknown'} staff={staff} />
}

function AiWorkspaceContent({ staff }) {
  const storageKey = `jiayicare-ai-workspace-trial:${staff?._id || staff?.id || 'unknown'}`
  const [sessions, setSessions] = useState(() => readSessions(storageKey))
  const [activeId, setActiveId] = useState(null)
  const [mode, setMode] = useState('free')
  const [webSearch, setWebSearch] = useState(true)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const composerRef = useRef(null)
  const messagesRef = useRef(null)

  useEffect(() => {
    let live = true
    staffAPI.aiWorkspaceStatus().then(result => { if (live) setStatus(result.data) }).catch(() => { if (live) setStatus({ enabled: false, ready: false }) })
    return () => { live = false }
  }, [])
  useEffect(() => { sessionStorage.setItem(storageKey, JSON.stringify(sessions.slice(0, 20))) }, [storageKey, sessions])
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }, [sessions, activeId])

  const active = sessions.find(s => s.id === activeId)
  const selectedMode = active?.mode || mode
  const ready = status?.enabled && status?.ready && status.dailyUsed < status.dailyLimit
  const unavailableMessage = !status?.ready ? '通义千问尚未配置，请联系管理员' : status.dailyUsed >= status.dailyLimit ? '今天的试用次数已用完，请明天再试' : ''

  const createDiscussion = (nextMode = selectedMode) => {
    const session = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, mode: nextMode, title: '新讨论', updatedAt: Date.now(), messages: [] }
    setSessions(prev => [session, ...prev].slice(0, 20))
    setActiveId(session.id)
    setMode(nextMode)
    setDraft('')
    setError('')
    requestAnimationFrame(() => composerRef.current?.focus())
    return session
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || busy || !ready || selectedMode === 'knowledge') return
    if (text.length > 4000) { setError('单次输入请控制在 4000 字以内'); return }
    const session = active || createDiscussion(selectedMode)
    const searchEnabled = selectedMode === 'free' && webSearch
    const userMessage = { role: 'user', content: text }
    const history = [...session.messages, userMessage].slice(-13).map(m => ({ role: m.role, content: m.content }))
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: s.messages.length ? s.title : text.slice(0, 22), updatedAt: Date.now(), messages: [...s.messages, userMessage] } : s))
    setDraft('')
    setBusy(true)
    setError('')
    try {
      const result = await staffAPI.aiWorkspaceChat(selectedMode, history, searchEnabled)
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, updatedAt: Date.now(), messages: [...s.messages, { role: 'assistant', content: result.data.content, webSearch: result.data.webSearch }] } : s))
      setStatus(prev => ({ ...prev, dailyUsed: result.data.dailyUsed }))
    } catch (e) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: s.messages.slice(0, -1) } : s))
      setDraft(text)
      setError(e.message || '生成失败，请重试')
    } finally { setBusy(false) }
  }

  const copy = async content => {
    try { await navigator.clipboard.writeText(content); setError('内容已复制') }
    catch { setError('复制失败，请手动选择内容') }
  }

  if (status === null) return <div className="aiw-unavailable">正在检查 AI 工作台试用权限…</div>
  if (!status.enabled) return <div className="aiw-unavailable"><h2>AI 工作台试用尚未开放</h2><p>管理员开启试用开关并设置试用人员后，这里会显示讨论页面。</p></div>

  return <div className="aiw-shell">
    <aside className="aiw-sessions">
      <div className="aiw-sessions-head"><div className="aiw-eyebrow">AI WORKSPACE · 试用</div><h2>我的讨论</h2><button type="button" className="aiw-primary" disabled={busy} onClick={() => createDiscussion()}>＋ 新建讨论</button></div>
      <div className="aiw-session-list">{sessions.map(s => <button type="button" disabled={busy} key={s.id} className={`aiw-session ${s.id === activeId ? 'active' : ''}`} onClick={() => { setActiveId(s.id); setMode(s.mode); setDraft(''); setError('') }}><strong>{s.title}</strong><small>{s.mode === 'reply' ? '客户回复草稿' : '自由探讨'} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}</small></button>)}{!sessions.length && <p className="aiw-empty-list">尚无讨论</p>}</div>
      <p className="aiw-local-note">讨论暂存于当前浏览器标签页。<br />请勿输入真实客户信息。</p>
    </aside>
    <section className="aiw-main">
      <header className="aiw-header"><div><h1>嘉医汇 AI 工作台 <span>试用</span></h1><p>通义千问辅助讨论 · 不连接客户档案</p></div><button type="button" className="aiw-clear" disabled={!active || busy} onClick={() => { setSessions(prev => prev.filter(s => s.id !== activeId)); setActiveId(null); setDraft(''); setError('') }}>清空当前讨论</button></header>
      <div className="aiw-mode-row">{MODES.map(item => <button type="button" key={item.key} disabled={item.disabled || busy} className={`aiw-mode ${selectedMode === item.key ? 'active' : ''}`} onClick={() => createDiscussion(item.key)}><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
      <div className="aiw-info">{selectedMode === 'reply' ? '客户回复草稿：只输入模拟客户消息；生成后由员工核对，系统不会自动发送，也不会联网搜索。' : '自由探讨：不读取内部知识库、产品实时数据或客户资料。近期事实请核对检索结果。'}</div>
      {selectedMode === 'free' && <label className="aiw-search-option"><input type="checkbox" checked={webSearch} disabled={busy} onChange={e => setWebSearch(e.target.checked)} /> 联网查最新信息 <small>默认开启；可能增加调用费用。请勿输入真实客户信息。</small></label>}
      <div className="aiw-messages" ref={messagesRef}>{active?.messages.length ? active.messages.map((message, index) => <div key={`${active.id}-${index}`} className={`aiw-message ${message.role === 'user' ? 'user' : 'assistant'}`}><div className="aiw-avatar">{message.role === 'user' ? '我' : '✦'}</div><div className="aiw-bubble">{message.role === 'assistant' && <b>通义千问 · {message.webSearch ? '联网模式' : 'AI 回答'}</b>}<div>{message.content}</div>{message.role === 'assistant' && <button type="button" onClick={() => copy(message.content)}>复制内容</button>}</div></div>) : <div className="aiw-welcome"><span>✦ 嘉医汇 AI 助手</span><h2>{active ? '新讨论已创建，输入第一个问题。' : selectedMode === 'reply' ? '先用模拟客户消息试试起草。' : '和 AI 一起梳理思路。'}</h2><p>从一个问题开始。模型会结合本次讨论连续回答，内容仅供员工核对。</p><div className="aiw-ideas">{IDEAS[selectedMode].map(idea => <button type="button" key={idea} onClick={() => { setDraft(idea); composerRef.current?.focus() }}>{idea} ↗</button>)}</div></div>}{busy && <div className="aiw-working">通义千问正在生成回答…</div>}</div>
      <div className="aiw-composer"><textarea ref={composerRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={!ready || busy} placeholder={ready ? selectedMode === 'reply' ? '输入模拟客户消息，生成待审核回复草稿…' : '输入您想讨论的问题…' : unavailableMessage} /><div className="aiw-compose-foot"><span>{error || unavailableMessage || `仅用模拟内容试用；今日已调用 ${status.dailyUsed}/${status.dailyLimit} 次。`}</span><button type="button" className="aiw-primary" disabled={!draft.trim() || !ready || busy} onClick={send}>{busy ? '生成中…' : '发送 ↗'}</button></div></div>
    </section>
  </div>
}
