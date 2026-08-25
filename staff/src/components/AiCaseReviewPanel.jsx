import React, { useEffect, useMemo, useRef, useState } from 'react'
import { staffAPI, API_ORIGIN } from '../api'

const SCOPES = [
  ['basic', '基本资料'], ['healthProfile', '健康档案'], ['reports', '体检报告'], ['healthRecords', '健康监测'],
  ['medications', '用药/营养素'], ['followups', '随访'], ['plans', '管理方案'], ['aiAnalysis', '既有AI分析'],
]
const PROVIDER_LABEL = '通义千问'
const REVIEW_TEMPLATES = [
  { key: 'checkup', label: '体检方案研判', title: '体检方案研判', description: '结合体检报告、健康档案和既往检查，明确体检重点与待审核方案。', scopes: ['basic','healthProfile','reports','plans','aiAnalysis'] },
  { key: 'nutrition', label: '营养干预研判', title: '营养干预研判', description: '结合指标、生活方式和依从性讨论营养干预方向，形成待审核方案。', scopes: ['basic','healthProfile','healthRecords','medications','followups','plans'] },
  { key: 'annual', label: '年度管理研判', title: '年度管理研判', description: '结合健康档案、目标和既有服务，讨论下一年度管理重点与待审核方案。', scopes: ['basic','healthProfile','reports','healthRecords','followups','plans','aiAnalysis'] },
  { key: 'assessment', label: '阶段性评估研判', title: '阶段性评估', description: '结合阶段数据评估管理执行、成效、风险和下一阶段待审核计划。', scopes: SCOPES.map(([key]) => key) },
  { key: 'medical', label: '就医协助研判', title: '就医协助研判', description: '围绕明确健康问题讨论复查、就医或陪诊安排，形成待审核方案。', scopes: ['basic','healthProfile','reports','plans','aiAnalysis'] },
  { key: 'daily', label: '日常问题交流', title: '日常问题交流', description: '围绕具体问题进行信息分析和讨论；仅保存讨论结论，不自动生成方案。', scopes: ['basic','healthProfile','reports','healthRecords','medications','followups'] },
]

const ASSESSMENT_LABELS = { summary: '核心结论', facts: '已确认事实', changes: '阶段变化', risks: '重点风险', actions: '下一步行动', missing: '待补信息' }
function StructuredAssessment({ data }) {
  if (!data) return null
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 10, marginBottom: 12 }}>
    {Object.entries(ASSESSMENT_LABELS).map(([key, label]) => (data[key] || []).length > 0 && <section key={key} style={{ border: '1px solid #DCE8E1', borderRadius: 10, padding: 12, background: key === 'risks' ? '#FFF8ED' : key === 'actions' ? '#EEF8F3' : '#FAFCFB' }}>
      <div style={{ fontWeight: 700, color: key === 'risks' ? '#B45309' : '#155E48', marginBottom: 7 }}>{label}</div>
      {(data[key] || []).map((item, index) => <div key={index} style={{ fontSize: 13, lineHeight: 1.55, marginTop: 5, paddingLeft: 12, position: 'relative' }}><span style={{ position: 'absolute', left: 0 }}>•</span>{item}</div>)}
    </section>)}
  </div>
}

function CleanText({ children }) {
  const lines = String(children || '').split(/\r?\n/).map(line => line.replace(/^\s*#{1,6}\s*/, '').replace(/\*\*|__|`/g, '').trim()).filter(line => line && !/^[-—_]{3,}$/.test(line))
  return <div>{lines.map((line, index) => <div key={index} style={{ lineHeight: 1.65, fontSize: 14, marginTop: index ? 5 : 0 }}>{line.replace(/^[-*+]\s+/, '• ')}</div>)}</div>
}

export default function AiCaseReviewPanel({ patientId, staff, toast }) {
  const [topics, setTopics] = useState([])
  const [assessments, setAssessments] = useState([])
  const [activeId, setActiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', preferredProvider: 'qwen', contextScopes: SCOPES.map(([key]) => key) })
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
      const [topicRes, assessmentRes] = await Promise.all([staffAPI.getAiCaseReviews(patientId), staffAPI.getPhaseAssessments(patientId)])
      setTopics(topicRes.data || [])
      setAssessments(assessmentRes.data || [])
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
    try {
      const writeToPhaseAssessment = /阶段性.*评估/.test(`${active.title} ${active.description || ''}`)
      const res = await staffAPI.confirmAiCaseReviewConclusion(patientId, active._id, conclusionText, writeToPhaseAssessment)
      replaceTopic(res.data)
      if (res.archivedToPhaseAssessment && res.customerPushEligible === false) toast('已保存为内部评估，但未匹配启用的季度模板，禁止推送客户', 'error')
      else if (res.archivedToPhaseAssessment) toast('结论已按季度模板入档，可在服务记录中复核客户版')
      else toast('结论已确认，生成管理方案时会自动引用')
    }
    catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const applyReviewTemplate = async key => {
    const item = REVIEW_TEMPLATES.find(v => v.key === key); if (!item || !active) return
    setBusy(true)
    try {
      const description = `${item.description}\n\n固定研判输出：${item.key === 'daily' ? '问题要点、已确认事实、待补信息、人工决定的后续事项' : '研判依据、管理执行/问题分析、风险或数据缺口、待审核方案/下一步计划'}`
      const res = await staffAPI.updateAiCaseReview(patientId, active._id, { title: item.title, description, contextScopes: item.scopes })
      replaceTopic(res.data); toast(`已套用${item.label}模板`)
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }
  const reviewAssessment = async (assessment, action) => {
    const reviewNote = window.prompt(action === 'approve' ? '审核备注（可选）：' : '请填写退回原因：', '')
    if (reviewNote === null || (action === 'reject' && !reviewNote.trim())) return
    setBusy(true)
    try {
      const res = await staffAPI.reviewPhaseAssessment(patientId, assessment._id, action, reviewNote)
      setAssessments(list => list.map(item => item._id === assessment._id ? res.data : item))
      toast(action === 'approve' ? '阶段性评估已审核；不会自动改写方案' : '阶段性评估已退回')
    } catch (err) { toast(err.message, 'error') } finally { setBusy(false) }
  }

  if (loading) return <div className="card"><div className="card-body">正在加载专题研判资料…</div></div>
  return <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)', gap: 16, minHeight: 680 }}>
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card-header"><div className="card-title">AI辅助研判</div><button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>新建主题</button></div>
      <div className="card-body" style={{ padding: 10 }}>
        {!topics.length && <div style={{ padding: 20, color: '#8AA89C', textAlign: 'center' }}>为客户的具体健康问题建立独立研判主题</div>}
        {topics.map(topic => <button key={topic._id} onClick={() => setActiveId(topic._id)} style={{ width: '100%', textAlign: 'left', border: topic._id === active?._id ? '1px solid #1E6B50' : '1px solid #E0D9CE', background: topic._id === active?._id ? '#EEF7F2' : '#fff', borderRadius: 8, padding: 11, marginBottom: 8, cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, color: '#1A2B24' }}>{topic.title}</div>
          <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 5 }}>{topic.status === 'concluded' ? '已形成确认结论' : `${topic.messages?.length || 0} 条讨论`} · {PROVIDER_LABEL}</div>
        </button>)}
      </div>
    </div>

    {active ? <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {assessments.filter(item => item.status === 'pending').map(item => <div className="card" key={item._id} style={{ border: '1px solid #7C3AED55' }}><div className="card-header"><div className="card-title">📊 {item.periodLabel}阶段性评估待审核</div><span style={{ fontSize: 12, color: '#7C3AED' }}>{item.templateSnapshot?.name || '模板驱动评估'}</span></div><div className="card-body"><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14 }}>{item.content}</div><div style={{ marginTop: 10, fontSize: 12, color: '#65776F' }}>依据：{(item.evidenceSources || []).join('；') || '无'}</div>{['familyDoctor', 'superadmin'].includes(staff?.role) && <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'approve')}>审核通过</button><button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => reviewAssessment(item, 'reject')}>退回调整</button></div>}</div></div>)}
      <div className="card"><div className="card-body" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div><div style={{ fontSize: 18, fontWeight: 700 }}>{active.title}</div><div style={{ color: '#4A6558', fontSize: 13, marginTop: 4 }}>{active.description || '围绕该问题持续讨论，资料和结论均保存在客户专项资料库。'}</div></div>
          <div style={{ color: '#4A6558', fontSize: 13 }}>当前模型：{PROVIDER_LABEL}</div>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SCOPES.map(([key, label]) => {
          const checked = active.contextScopes?.includes(key)
          return <label key={key} style={{ fontSize: 12, border: `1px solid ${checked ? '#1E6B50' : '#D8E1DC'}`, color: checked ? '#1E6B50' : '#65776F', borderRadius: 16, padding: '5px 9px', cursor: 'pointer' }}><input type="checkbox" checked={checked} onChange={() => updateScopes(checked ? active.contextScopes.filter(v => v !== key) : [...active.contextScopes, key])} style={{ marginRight: 5 }} />{label}</label>
        })}</div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #E5ECE8' }}><div style={{ fontSize: 12, color: '#65776F', marginBottom: 7 }}>套用研判模板（可用于当前主题）</div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{REVIEW_TEMPLATES.map(item => <button key={item.key} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => applyReviewTemplate(item.key)}>{item.label}</button>)}</div></div>
      </div></div>

      <div className="card" style={{ flex: 1 }}><div className="card-body" style={{ height: 480, overflowY: 'auto', background: '#F7F8F6' }}>
        {!active.messages?.length && <div style={{ color: '#8AA89C', textAlign: 'center', paddingTop: 120 }}>输入问题或上传图片，AI会按上方授权范围调取客户资料。</div>}
        {(active.messages || []).map(message => <div key={message._id} style={{ display: 'flex', justifyContent: message.role === 'staff' ? 'flex-end' : 'flex-start', marginBottom: 14 }}><div style={{ maxWidth: '82%', background: message.role === 'staff' ? '#DDF2E7' : '#fff', border: '1px solid #DCE5E0', borderRadius: 12, padding: '10px 13px' }}>
          <div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 5 }}>{message.role === 'ai' ? `AI助手 · ${message.provider || ''}${message.durationMs ? ` · ${(message.durationMs / 1000).toFixed(1)}秒` : ''}` : `${message.staffName} · ${message.staffRole}`}</div>
          <CleanText>{message.content}</CleanText>
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
        <StructuredAssessment data={active.conclusion?.structured} />
        <textarea className="form-input" rows={10} value={conclusionText} onChange={e => setConclusionText(e.target.value)} placeholder="AI整理后由健康顾问复核确认；只有已确认结论会进入管理方案上下文。" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><span style={{ fontSize: 12, color: active.conclusion?.status === 'confirmed' ? '#16845B' : '#8AA89C' }}>{active.conclusion?.status === 'confirmed' ? `已由${active.conclusion.confirmedByName || '健康顾问'}确认${active.conclusion.serviceRecordId ? ' · 已写入阶段性健康评估' : ''}` : '草稿不会进入正式管理方案'}</span>{['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-primary btn-sm" disabled={busy || !conclusionText.trim()} onClick={confirmConclusion}>{/阶段性.*评估/.test(`${active.title} ${active.description || ''}`) ? '确认并写入阶段性健康评估' : '确认并纳入管理方案'}</button>}</div>
      </div></div>}
    </div> : <div className="card"><div className="card-body" style={{ padding: 60, textAlign: 'center', color: '#8AA89C' }}>请先新建一个研判主题</div></div>}

    {showCreate && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 620 }}><div className="modal-header"><div className="modal-title">新建AI研判主题</div><button className="modal-close" onClick={() => setShowCreate(false)}>×</button></div><div className="modal-body">
      <div className="form-group"><label className="form-label">研判模板</label><select className="form-input" defaultValue="" onChange={e => { const item = REVIEW_TEMPLATES.find(v => v.key === e.target.value); if (item) setForm(f => ({ ...f, title: item.title, description: item.description, contextScopes: item.scopes })) }}><option value="">自定义主题</option>{REVIEW_TEMPLATES.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}</select><div style={{ fontSize: 12, color: '#65776F', marginTop: 5 }}>模板会预填讨论目标和可读取资料；日常问题交流不用于生成方案。</div></div>
      <div className="form-group"><label className="form-label">主题名称</label><input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：近期血压波动原因分析" /></div>
      <div className="form-group"><label className="form-label">问题说明</label><textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
      <div className="form-group"><label className="form-label">测试模型</label><div className="form-input" style={{ background: '#F7F8F6', color: '#4A6558' }}>{PROVIDER_LABEL}</div></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={createTopic}>创建主题</button></div></div></div>}
  </div>
}
