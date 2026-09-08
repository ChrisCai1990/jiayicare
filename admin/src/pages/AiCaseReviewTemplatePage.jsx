import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const SCOPE_OPTIONS = [
  ['basic', '基本资料'], ['healthProfile', '健康档案'], ['reports', '体检报告'], ['healthRecords', '健康监测'],
  ['medications', '用药/营养素'], ['followups', '随访'], ['plans', '管理方案'], ['aiAnalysis', '既有AI分析'],
]
const emptyForm = { name: '', status: 'active', content: { description: '', target: '专病分析结论', outputGuide: '', contextScopes: SCOPE_OPTIONS.map(([key]) => key) } }

export default function AiCaseReviewTemplatePage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    try { const res = await adminAPI.planTemplates('ai_case_review'); setItems(res.data || []) }
    catch (err) { toast(err.message) }
  }
  useEffect(() => { load() }, [])
  const open = item => {
    setEditing(item || null)
    setForm(item ? { name: item.name, status: item.status, content: { ...emptyForm.content, ...(item.content || {}) } } : structuredClone(emptyForm))
    setShowEditor(true)
  }
  const setContent = (key, value) => setForm(value0 => ({ ...value0, content: { ...value0.content, [key]: value } }))
  const save = async () => {
    if (!form.name.trim() || !form.content.description.trim()) return toast('请填写模板名称和分析说明')
    setBusy(true)
    try {
      const payload = { type: 'ai_case_review', name: form.name.trim(), status: form.status, content: form.content }
      if (editing) await adminAPI.updatePlanTemplate(editing._id, payload)
      else await adminAPI.createPlanTemplate(payload)
      toast(editing ? '专病分析模板已更新' : '专病分析模板已创建'); setEditing(null); setShowEditor(false); setForm(emptyForm); await load()
    } catch (err) { toast(err.message) } finally { setBusy(false) }
  }
  const toggle = async item => { try { await adminAPI.togglePlanTemplate(item._id); await load() } catch (err) { toast(err.message) } }

  return <div>
    <div className="page-header"><div><div className="page-title">专病分析模板</div><div className="page-subtitle">在这里逐步调整分析范围和输出结构；启用的模板会自动出现在医护端“专项研判 → 新建主题”。</div></div><button className="btn btn-primary" onClick={() => open(null)}>新增模板</button></div>
    <div className="card"><div className="card-body">
      {!items.length ? <div style={{ color: '#8AA89C', padding: 28, textAlign: 'center' }}>暂无模板。医护端首次读取时会自动建立“专病分析”基础模板。</div> : items.map(item => <div key={item._id} style={{ border: '1px solid #E0E8E3', borderRadius: 10, padding: 14, marginBottom: 10, display: 'flex', justifyContent: 'space-between', gap: 20 }}>
        <div><div style={{ fontWeight: 800 }}>{item.name} <span style={{ marginLeft: 8, fontSize: 12, color: item.status === 'active' ? '#16845B' : '#8AA89C' }}>{item.status === 'active' ? '已启用' : '已停用'}</span></div><div style={{ color: '#4A6558', fontSize: 13, marginTop: 6 }}>{item.content?.description || '未填写分析说明'}</div><div style={{ color: '#8AA89C', fontSize: 12, marginTop: 5 }}>输出：{item.content?.outputGuide || '未限定'}</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn btn-secondary btn-sm" onClick={() => open(item)}>编辑</button><button className="btn btn-secondary btn-sm" onClick={() => toggle(item)}>{item.status === 'active' ? '停用' : '启用'}</button></div>
      </div>)}
    </div></div>
    {showEditor && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 700 }}><div className="modal-header"><div className="modal-title">{editing ? '编辑' : '新增'}专病分析模板</div><button className="modal-close" onClick={() => { setEditing(null); setShowEditor(false); setForm(emptyForm) }}>×</button></div><div className="modal-body">
      <div className="form-group"><label className="form-label">模板名称</label><input className="form-input" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} placeholder="如：甲状腺疾病纵向分析" /></div>
      <div className="form-group"><label className="form-label">分析说明</label><textarea className="form-input" rows={4} value={form.content.description} onChange={e => setContent('description', e.target.value)} placeholder="说明该专病需要综合哪些资料、解决什么问题" /></div>
      <div className="form-group"><label className="form-label">固定输出结构</label><textarea className="form-input" rows={3} value={form.content.outputGuide} onChange={e => setContent('outputGuide', e.target.value)} placeholder="如：疾病时间轴、指标变化、治疗与用药、风险、待补资料、下一步建议" /></div>
      <div className="form-group"><label className="form-label">确认后的用途</label><input className="form-input" value={form.content.target} onChange={e => setContent('target', e.target.value)} /></div>
      <div className="form-group"><label className="form-label">允许调取的资料</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{SCOPE_OPTIONS.map(([key, label]) => <label key={key} style={{ fontSize: 13 }}><input type="checkbox" checked={form.content.contextScopes.includes(key)} onChange={() => setContent('contextScopes', form.content.contextScopes.includes(key) ? form.content.contextScopes.filter(v => v !== key) : [...form.content.contextScopes, key])} /> {label}</label>)}</div></div>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => { setEditing(null); setShowEditor(false); setForm(emptyForm) }}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存模板'}</button></div></div></div>}
  </div>
}
