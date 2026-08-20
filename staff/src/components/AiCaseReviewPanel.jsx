import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI, API_ORIGIN } from '../api'

const SCOPES = [
  ['basic', '基本资料'], ['healthProfile', '健康档案'], ['reports', '体检报告'], ['healthRecords', '健康监测'],
  ['medications', '用药/营养素'], ['followups', '随访'], ['plans', '管理方案'], ['aiAnalysis', '既有AI分析'],
]
const PROVIDERS = { auto: '自动选择', workbuddy: 'WorkBuddy', qwen: '通义千问', deepseek: 'DeepSeek' }

export default function AiCaseReviewPanel({ patientId, staff, toast }) {
  const [topics, setTopics] = useState([])
  const [activeId, setActiveId] = useState('')
  const [providers, setProviders] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', preferredProvider: 'auto', contextScopes: SCOPES.map(([key]) => key) })
  const [conclusionText, setConclusionText] = useState('')
  const bottomRef = useRef(null)
  const active = useMemo(() => topics.find(item => item._id === activeId) || topics[0], [topics, activeId])

  const replaceTopic = topic => {
    setTopics(items => [topic, ...items.filter(item => item._id !== topic._id)])
    setActiveId(topic._id)
  }
  const load = async () => {
    setLoading(true)
    try {
      const [topicRes, providerRes] = await Promise.all([staffAPI.getAiCaseReviews(patientId), staffAPI.getAiCaseReviewProviders()])
      setTopics(topicRes.data || []); setProviders(providerRes.data || {})
      if (!activeId && topicRes.data?.length) setActiveId(topicRes.data[0]._id)
    } catch (err) { toast(err.message, 'error') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [patientId])
  useEffect(() => { setConclusionText(active?.conclusion?.content || ''); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30) }, [active?._id, active?.messages?.length])

  const createTopic = async () => {
    if (!form.title.trim()) return toast('请输入研判主题', 'error')
    setBusy(true)
    try { const res = await staffAPI.createAiCaseReview(patientId, form); replaceTopic(res.data); setShowCreate(false); setForm(f => ({ ...f, title: '', description: '' })) }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const updateProvider = async preferredProvider => {
    try { const res = await staffAPI.updateAiCaseReview(patientId, active._id, { preferredProvider }); replaceTopic(res.data) }
    catch (err) { toast(err.message, 'error') }
  }
  const updateScopes = async contextScopes => {
    try { const res = await staffAPI.updateAiCaseReview(patientId, active._id, { contextScopes }); replaceTopic(res.data) }
    catch (err) { toast(err.message, 'error') }
  }
  const uploadSelected = async event => {
    const selected = Array.from(event.target.files || []).slice(0, 6 - files.length)
    if (!selected.length) return
    setBusy(true)
    try {
      const uploaded = []
      for (const file of selected) {
        const res = await staffAPI.uploadImage(file)
        uploaded.push({ name: file.name, url: res.data.url, mimeType: file.type })
      }
      setFiles(list => [...list, ...uploaded].slice(0, 6))
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false); event.target.value = '' }
  }
  const send = async () => {
    if (!draft.trim() && !files.length) return
    setBusy(true)
    try {
      const res = await staffAPI.sendAiCaseReviewMessage(patientId, active._id, { content: draft, attachments: files })
      replaceTopic(res.data); setDraft(''); setFiles([])
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const generateConclusion = async () => {
    setBusy(true)
    try { const res = await staffAPI.generateAiCaseReviewConclusion(patientId, active._id); replaceTopic(res.data); setConclusionText(res.data.conclusion?.content || '') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const confirmConclusion = async () => {
    if (!conclusionText.trim()) return toast('结论不能为空', 'error')
    setBusy(true)
    try { const res = await staffAPI.confirmAiCaseReviewConclusion(patientId, active._id, conclusionText); replaceTopic(res.data); toast('结论已确认，生成管理方案时会自动引用') }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  if (loading) return <div className="card"><div className="card-body">正在加载专题研判资料…</div></div>
  return <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 16, minHeight: 680 }}>
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card-header"><div className="card-title">AI辅助研判</div><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>新建主题</button></div>
      <div className="card-body" style={{ padding: 10 }}>
        {!topics.length && <div style={{ padding: 20, color: '#8AA89C', textAlign: 'center' }}>为客户的具体健康问题建立独立研判主题</div>}
        {topics.map(topic => <button key={topic._id} onClick={() => setActiveId(topic._id)} style={{ width: '100%', textAlign: 'left', border: topic._id === active?._id ? '1px solid #1E6B50' : '1px solid #E0D9CE', background: topic._id === active?._id ? '#EEF7F2' : '#fff', borderRadius: 8, padding: 11, marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, color: '#1A2B24' }}>{topic.title}</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 5 }}>{topic.status === 'concluded' ? '已形成确认结论' : `${topic.messages?.length || 0} 条讨论`} · {PROVIDERS[topic.preferredProvider]}</div>
        </button>)}
      </div>
    </div>

    {active ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card"><div className="card-body" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{active.title}</div><div style={{ color: '#4A6558', fontSize: 13, marginTop: 4 }}>{active.description || '围绕该问题持续讨论，资料和结论均保存在客户专项资料库。'}</div></div>
          <select className="form-input" style={{ width: 180 }} value={active.preferredProvider} onChange={e => updateProvider(e.target.value)}>
            {Object.entries(PROVIDERS).map(([key, label]) => <option key={key} value={key} disabled={key !== 'auto' && !providers[key]}>{label}{key !== 'auto' && !providers[key] ? '（未配置）' : ''}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCOPES.map(([key, label]) => {
          const checked = active.contextScopes?.includes(key)
          return <label key={key} style={{ fontSize: 12, border: `1px solid ${checked ? '#1E6B50' : '#D8E1DC'}`, color: checked ? '#1E6B50' : '#65776F', borderRadius: 16, padding: '5px 9px', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => updateScopes(checked ? active.contextScopes.filter(v => v !== key) : [...active.contextScopes, key])} style={{ marginRight: 5 }} />{label}</label>
        })}</div>
      </div></div>

      <div className="card" style={{ flex: 1 }}><div className="card-body" style={{ height: 480, overflowY: 'auto', background: '#F7F8F6' }}>
        {!active.messages?.length && <div style={{ color: '#8AA89C', textAlign: 'center', paddingTop: 120 }}>输入问题或上传图片，AI会按上方授权范围调取客户资料。</div>}
        {(active.messages || []).map(message => <div key={message._id} style={{ display: 'flex', justifyContent: message.role === 'staff' ? 'flex-end' : 'flex-start', marginBottom: 14 }}><div style={{ maxWidth: '82%', background: message.role === 'staff' ? '#DDF2E7' : '#fff', border: '1px solid #DCE5E0', borderRadius: 12, padding: '10px 13px' }}>
          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 5 }}>{message.role === 'ai' ? `AI助手 · ${message.provider || ''}${message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)}秒` : ''}` : `${message.staffName} · ${message.staffRole}`}</div>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14 }}>{message.content}</div>
          {!!message.attachments?.length && <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>{message.attachments.map((file, index) => <a key={index} href={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} target="_blank" rel="noreferrer"><img src={file.url?.startsWith('/') ? `${API_ORIGIN}${file.url}` : file.url} alt={file.name || '附件'} style={{ width: 90, height: 72, objectFit: 'cover', borderRadius: 6 }} /></a>)}</div>}
          {!!message.contextSnapshot?.sources?.length && <details style={{ marginTop: 8, fontSize: 12, color: '#4A6558' }}><summary>本轮依据 {message.contextSnapshot.sources.length} 项资料</summary><div style={{ marginTop: 5 }}>{message.contextSnapshot.sources.map((s, i) => <div key={i}>· {s}</div>)}</div></details>}
        </div></div>)}<div ref={bottomRef} />
      </div></div>

      <div className="card"><div className="card-body" style={{ padding: 12 }}>
        {!!files.length && <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>{files.map((file, index) => <span key={index} style={{ fontSize: 12, background: '#EEF7F2', padding: '5px 8px', borderRadius: 6 }}>{file.name}<button onClick={() => setFiles(list => list.filter((_, i) => i !== index))} style={{ border: 0, background: 'none', cursor: 'pointer' }}>×</button></span>)}</div>}
        <textarea className="form-input" rows={3} value={draft} onChange={e => setDraft(e.target.value)} placeholder="提出问题、补充判断，或说明希望AI调取和比较哪些资料…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}><label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>添加图片<input type="file" accept="image/*" multiple hidden onChange={uploadSelected} /></label><button className="btn btn-primary btn-sm" disabled={busy || (!draft.trim() && !files.length)} onClick={send}>{busy ? '处理中…' : '发送给AI'}</button></div>
      </div></div>

      {!!active.messages?.length && <div className="card"><div className="card-header"><div className="card-title">阶段性结论</div><button className="btn btn-secondary btn-sm" disabled={busy} onClick={generateConclusion}>AI整理结论</button></div><div className="card-body">
        <textarea className="form-input" rows={10} value={conclusionText} onChange={e => setConclusionText(e.target.value)} placeholder="AI整理后由健康顾问复核确认；只有已确认结论会进入管理方案上下文。" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><span style={{ fontSize: 12, color: active.conclusion?.status === 'confirmed' ? '#16845B' : '#8AA89C' }}>{active.conclusion?.status === 'confirmed' ? `已由${active.conclusion.confirmedByName || '健康顾问'}确认` : '草稿不会进入正式管理方案'}</span>{['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy || !conclusionText.trim()} onClick={confirmConclusion}>确认并纳入管理方案</button>}</div>
      </div></div>}
    </div> : <div className="card"><div className="card-body" style={{ padding: 60, textAlign: 'center', color: '#8AA89C' }}>请先新建一个研判主题</div></div>}

    {showCreate && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 620 }}><div className="modal-header"><div className="modal-title">新建AI研判主题</div><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div><div className="modal-body">
      <div className="form-group"><label className="form-label">主题名称</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：近期血压波动原因分析" /></div>
      <div className="form-group"><label className="form-label">问题说明</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">首选AI</label><select className="form-input" value={form.preferredProvider} onChange={e => setForm(f => ({ ...f, preferredProvider: e.target.value }))}>{Object.entries(PROVIDERS).map(([key, label]) => <option key={key} value={key} disabled={key !== 'auto' && !providers[key]}>{label}{key !== 'auto' && !providers[key] ? '（未配置）' : ''}</option>)}</select></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={createTopic}>创建主题</button></div></div></div>}
  </div>
}
