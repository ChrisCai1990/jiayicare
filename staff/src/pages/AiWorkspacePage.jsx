import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'
import { readAiWorkspaceAttachment } from '../utils/aiWorkspaceAttachment'
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
  const read = storage => {
    try {
      const rows = JSON.parse(storage.getItem(key) || 'null')
      return Array.isArray(rows) ? rows : []
    } catch { return [] }
  }
  const merged = new Map()
  for (const item of [...read(localStorage), ...read(sessionStorage)]) {
    if (!item || typeof item.id !== 'string' || !['free', 'reply'].includes(item.mode) || !Array.isArray(item.messages)) continue
    if (!merged.has(item.id) || Number(item.updatedAt) > Number(merged.get(item.id).updatedAt)) merged.set(item.id, item)
  }
  return [...merged.values()]
}

export default function AiWorkspacePage() {
  const { staff } = useStaff()
  return <AiWorkspaceContent key={staff?._id || staff?.id || 'unknown'} staff={staff} />
}

function AiWorkspaceContent({ staff }) {
  const storageKey = `jiayicare-ai-workspace-trial:${staff?._id || staff?.id || 'unknown'}`
  const [sessions, setSessions] = useState(() => readSessions(storageKey))
  const [loaded, setLoaded] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [saveRetry, setSaveRetry] = useState(0)
  const [activeId, setActiveId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [mode, setMode] = useState('free')
  const [webSearch, setWebSearch] = useState(true)
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [readingFile, setReadingFile] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const composerRef = useRef(null)
  const fileRef = useRef(null)
  const messagesRef = useRef(null)
  const saveQueue = useRef(new Map())
  const savedVersions = useRef(new Map())

  useEffect(() => {
    let live = true
    staffAPI.aiWorkspaceStatus().then(result => { if (live) setStatus(result.data) }).catch(() => { if (live) setStatus({ enabled: false, ready: false }) })
    return () => { live = false }
  }, [])
  useEffect(() => {
    if (!status?.enabled) return
    let live = true
    staffAPI.aiWorkspaceDiscussions().then(result => {
      if (!live) return
      const remote = result.data || []
      const local = readSessions(storageKey)
      const merged = new Map(remote.map(s => [s.id, s]))
      for (const item of local) if (!merged.has(item.id) || item.updatedAt > merged.get(item.id).updatedAt) merged.set(item.id, item)
      for (const item of remote) savedVersions.current.set(item.id, JSON.stringify(item))
      setSessions([...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt))
      setLoaded(true)
      sessionStorage.removeItem(storageKey)
    }).catch(() => { if (live) { setSaveState('读取云端讨论失败；当前显示浏览器副本，请稍后刷新重试'); setLoaded(true) } })
    return () => { live = false }
  }, [status?.enabled, storageKey])
  useEffect(() => {
    if (!loaded) return
    try { localStorage.setItem(storageKey, JSON.stringify(sessions)) }
    catch { setSaveState('浏览器空间不足，讨论副本未能保存') }
    for (const session of sessions) {
      const version = JSON.stringify(session)
      if (savedVersions.current.get(session.id) === version) continue
      setSaveState('正在保存讨论…')
      const previous = saveQueue.current.get(session.id) || Promise.resolve()
      const next = previous.catch(() => {}).then(() => staffAPI.saveAiWorkspaceDiscussion(session)).then(() => {
        savedVersions.current.set(session.id, version)
        setSaveState('讨论已保存到账号')
      }).catch(e => { setSaveState(e.message || '讨论保存失败，已留在本浏览器；请保持页面并重试') })
      saveQueue.current.set(session.id, next)
    }
  }, [loaded, sessions, storageKey, saveRetry])
  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }, [sessions, activeId])

  const active = sessions.find(s => s.id === activeId)
  const selectedMode = active?.mode || mode
  const ready = loaded && status?.enabled && status?.ready && status.dailyUsed < status.dailyLimit
  const unavailableMessage = !loaded ? '正在读取讨论记录…' : !status?.ready ? '通义千问尚未配置，请联系管理员' : status.dailyUsed >= status.dailyLimit ? '今天的试用次数已用完，请明天再试' : ''

  const createDiscussion = (nextMode = selectedMode, preserveAttachment = false) => {
    const session = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, mode: nextMode, title: '新讨论', updatedAt: Date.now(), messages: [] }
    setSessions(prev => [session, ...prev])
    setActiveId(session.id)
    setMode(nextMode)
    setDraft('')
    if (!preserveAttachment) setAttachment(null)
    setError('')
    requestAnimationFrame(() => composerRef.current?.focus())
    return session
  }

  const send = async () => {
    const text = draft.trim() || (attachment ? '请分析附件内容，并指出需要人工核实的地方。' : '')
    if (!text || busy || readingFile || !ready || selectedMode === 'knowledge') return
    if (text.length > 4000) { setError('单次输入请控制在 4000 字以内'); return }
    const session = active || createDiscussion(selectedMode, true)
    const searchEnabled = selectedMode === 'free' && webSearch && !attachment
    const userMessage = { role: 'user', content: attachment ? `${text}\n【附件：${attachment.name}】` : text }
    const history = [...session.messages, userMessage].slice(-13).map(m => ({ role: m.role, content: m.content }))
    setSessions(prev => prev.map(s => s.id === session.id ? { ...s, title: s.messages.length ? s.title : text.slice(0, 22), updatedAt: Date.now(), messages: [...s.messages, userMessage] } : s))
    setDraft('')
    setBusy(true)
    setError('')
    try {
      const result = await staffAPI.aiWorkspaceChat(selectedMode, history, searchEnabled, attachment && (attachment.kind === 'image' ? { kind: 'image', name: attachment.name, dataUrl: attachment.dataUrl } : { kind: 'text', name: attachment.name, text: attachment.text }))
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, updatedAt: Date.now(), messages: [...s.messages, { role: 'assistant', content: result.data.content, webSearch: result.data.webSearch }] } : s))
      setStatus(prev => ({ ...prev, dailyUsed: result.data.dailyUsed }))
      setAttachment(null)
    } catch (e) {
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, messages: s.messages.slice(0, -1) } : s))
      setDraft(text)
      setError(e.message || '生成失败，请重试')
    } finally { setBusy(false) }
  }

  const selectFile = async file => {
    if (!file || busy || !ready) return
    setReadingFile(true)
    setError('')
    try { setAttachment(await readAiWorkspaceAttachment(file)) }
    catch (e) { setError(e.message || '文件读取失败') }
    finally { setReadingFile(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const onDrop = e => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files.length > 1) { setError('每次只能上传一个文件'); return }
    selectFile(e.dataTransfer.files[0])
  }

  const onPaste = e => {
    const pastedFiles = Array.from(e.clipboardData?.items || [])
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter(Boolean)
    if (!pastedFiles.length) return
    e.preventDefault()
    if (pastedFiles.length > 1) { setError('每次只能添加一个附件'); return }
    const pastedText = e.clipboardData.getData('text/plain')
    if (pastedText && e.target === composerRef.current) {
      const { selectionStart, selectionEnd } = e.target
      setDraft(value => value.slice(0, selectionStart) + pastedText + value.slice(selectionEnd))
    }
    const file = pastedFiles[0]
    const fallbackName = { 'image/png': '粘贴图片.png', 'image/jpeg': '粘贴图片.jpg', 'image/webp': '粘贴图片.webp', 'application/pdf': '粘贴文件.pdf' }[file.type]
    selectFile(!file.name && fallbackName ? new File([file], fallbackName, { type: file.type }) : file)
  }

  const copy = async content => {
    try { await navigator.clipboard.writeText(content); setError('内容已复制') }
    catch { setError('复制失败，请手动选择内容') }
  }

  const clearDiscussion = async () => {
    if (!active || busy) return
    try {
      await (saveQueue.current.get(active.id) || Promise.resolve())
      await staffAPI.deleteAiWorkspaceDiscussion(active.id)
      savedVersions.current.delete(active.id)
      setSessions(prev => prev.filter(s => s.id !== active.id))
      setActiveId(null)
      setDraft('')
      setAttachment(null)
      setError('')
      setSaveState('讨论已删除')
    } catch { setSaveState('删除失败，讨论仍保留；请重试') }
  }

  const renameDiscussion = event => {
    event.preventDefault()
    const title = editingTitle.trim()
    if (!title || title.length > 120) return
    setSessions(prev => prev.map(s => s.id === editingId
      ? { ...s, title, updatedAt: Math.max(Date.now(), Number(s.updatedAt) + 1) }
      : s).sort((a, b) => b.updatedAt - a.updatedAt))
    setEditingId(null)
    setEditingTitle('')
  }

  if (status === null) return <div className="aiw-unavailable">正在检查 AI 工作台试用权限…</div>
  if (!status.enabled) return <div className="aiw-unavailable"><h2>AI 工作台试用尚未开放</h2><p>管理员开启试用开关并设置试用人员后，这里会显示讨论页面。</p></div>

  return <div className="aiw-shell">
    <aside className="aiw-sessions">
      <div className="aiw-sessions-head"><div className="aiw-eyebrow">AI WORKSPACE · 试用</div><h2>我的讨论</h2><button type="button" className="aiw-primary" disabled={busy || !loaded} onClick={() => createDiscussion()}>＋ 新建讨论</button></div>
      <div className="aiw-session-list">{sessions.map(s => editingId === s.id
        ? <form key={s.id} className="aiw-session-edit" onSubmit={renameDiscussion}>
            <input aria-label="讨论主题" autoFocus maxLength={120} value={editingTitle} onChange={e => setEditingTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { setEditingId(null); setEditingTitle('') } }} />
            <button type="submit" disabled={!editingTitle.trim()}>保存</button><button type="button" onClick={() => { setEditingId(null); setEditingTitle('') }}>取消</button>
          </form>
        : <div key={s.id} className={`aiw-session-row ${s.id === activeId ? 'active' : ''}`}>
            <button type="button" disabled={busy} className="aiw-session" onClick={() => { setActiveId(s.id); setMode(s.mode); setDraft(''); setAttachment(null); setError('') }}><strong>{s.title}</strong><small>{s.mode === 'reply' ? '客户回复草稿' : '自由探讨'} · {new Date(s.updatedAt).toLocaleDateString('zh-CN')}</small></button>
            <button type="button" className="aiw-rename" disabled={busy || !loaded || !s.messages.length} aria-label={`修改主题：${s.title}`} title="修改主题" onClick={() => { setEditingId(s.id); setEditingTitle(s.title) }}>修改</button>
          </div>)}{!sessions.length && <p className="aiw-empty-list">{loaded ? '尚无讨论' : '正在读取讨论…'}</p>}</div>
      <p className="aiw-local-note">{saveState || '讨论按当前员工账号保存，并在本浏览器留有副本。'}{saveState.includes('失败') && <button type="button" onClick={() => setSaveRetry(value => value + 1)}>重试保存</button>}<br />请勿输入真实客户信息。</p>
    </aside>
    <section className="aiw-main">
      <header className="aiw-header"><div><h1>嘉医汇 AI 工作台 <span>试用</span></h1><p>通义千问辅助讨论 · 不连接客户档案</p></div><button type="button" className="aiw-clear" disabled={!active || busy || !loaded} onClick={clearDiscussion}>清空当前讨论</button></header>
      {saveState.includes('失败') && <p className="aiw-mobile-save">{saveState}<button type="button" onClick={() => setSaveRetry(value => value + 1)}>重试保存</button></p>}
      <div className="aiw-mode-row">{MODES.map(item => <button type="button" key={item.key} disabled={item.disabled || busy || !loaded} className={`aiw-mode ${selectedMode === item.key ? 'active' : ''}`} onClick={() => createDiscussion(item.key)}><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
      <div className="aiw-info">{selectedMode === 'reply' ? '客户回复草稿：只输入模拟客户消息；生成后由员工核对，系统不会自动发送，也不会联网搜索。' : '自由探讨：不读取内部知识库、产品实时数据或客户资料。近期事实请核对检索结果。'}</div>
      {selectedMode === 'free' && <label className="aiw-search-option"><input type="checkbox" checked={webSearch} disabled={busy} onChange={e => setWebSearch(e.target.checked)} /> 联网查最新信息 <small>默认开启；可能增加调用费用。请勿输入真实客户信息。</small></label>}
      {attachment && selectedMode === 'free' && webSearch && <p className="aiw-attachment-note">本次附带文件或图片，联网检索将暂时关闭。</p>}
      <div className="aiw-messages" ref={messagesRef}>{active?.messages.length ? active.messages.map((message, index) => <div key={`${active.id}-${index}`} className={`aiw-message ${message.role === 'user' ? 'user' : 'assistant'}`}><div className="aiw-avatar">{message.role === 'user' ? '我' : '✦'}</div><div className="aiw-bubble">{message.role === 'assistant' && <b>通义千问 · {message.webSearch ? '联网模式' : 'AI 回答'}</b>}<div>{message.content}</div>{message.role === 'assistant' && <button type="button" onClick={() => copy(message.content)}>复制内容</button>}</div></div>) : <div className="aiw-welcome"><span>✦ 嘉医汇 AI 助手</span><h2>{active ? '新讨论已创建，输入第一个问题。' : selectedMode === 'reply' ? '先用模拟客户消息试试起草。' : '和 AI 一起梳理思路。'}</h2><p>从一个问题开始。模型会结合本次讨论连续回答，内容仅供员工核对。</p><div className="aiw-ideas">{IDEAS[selectedMode].map(idea => <button type="button" key={idea} onClick={() => { setDraft(idea); composerRef.current?.focus() }}>{idea} ↗</button>)}</div></div>}{busy && <div className="aiw-working">通义千问正在生成回答…</div>}</div>
      <div className={`aiw-composer ${dragging ? 'dragging' : ''}`} onPaste={onPaste} onDragEnter={e => { e.preventDefault(); setDragging(true) }} onDragOver={e => e.preventDefault()} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }} onDrop={onDrop}>
        {dragging && <div className="aiw-drop-hint">松开即可添加附件</div>}
        <textarea ref={composerRef} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} disabled={!ready || busy} placeholder={ready ? selectedMode === 'reply' ? '输入模拟客户消息，生成待审核回复草稿…' : '输入您想讨论的问题…' : unavailableMessage} />
        {attachment && <div className="aiw-attachment"><span>{attachment.kind === 'image' ? '🖼' : '📄'} {attachment.name} · {(attachment.size / 1024).toFixed(0)} KB</span><button type="button" disabled={busy} onClick={() => setAttachment(null)} aria-label="移除附件">×</button></div>}
        <div className="aiw-compose-foot"><div className="aiw-compose-tools"><input ref={fileRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md,.csv,image/png,image/jpeg,image/webp,application/pdf" onChange={e => selectFile(e.target.files?.[0])} /><button type="button" className="aiw-upload" disabled={!ready || busy || readingFile} onClick={() => fileRef.current?.click()}>＋ 上传图片或文件</button><span>{error || unavailableMessage || (readingFile ? '正在读取文件…' : `支持粘贴或拖拽；每次 1 个附件，仅用模拟内容；今日已调用 ${status.dailyUsed}/${status.dailyLimit} 次。`)}</span></div><button type="button" className="aiw-primary" disabled={(!draft.trim() && !attachment) || !ready || busy || readingFile} onClick={send}>{busy ? '生成中…' : '发送 ↗'}</button></div>
      </div>
    </section>
  </div>
}
