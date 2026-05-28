import React, { useEffect, useState, useCallback } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const CAT_LABEL = { diet:'饮食', exercise:'运动', sleep:'睡眠', checkup:'体检注意事项', medication:'用药', service_flow:'服务流程', home_monitor:'居家监测', other:'其他' }

export default function KnowledgePage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [patients, setPatients] = useState([])
  const [pushModal, setPushModal] = useState(null) // knowledgeItem

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getKnowledge({ category: catFilter, search })
      setItems(res.data.items); setTotal(res.data.total)
    } finally { setLoading(false) }
  }, [catFilter, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { staffAPI.getPatients({ limit: 200 }).then(r => setPatients(r.data.patients)).catch(() => {}) }, [])

  const handleDelete = async id => {
    if (!window.confirm('确定删除？')) return
    try { await staffAPI.deleteKnowledge(id); toast('已删除'); load() }
    catch (err) { toast(err.message) }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">科普推送</h1>
          <p className="page-subtitle">共 {total} 条内容</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>＋ 新增内容</button>
      </div>

      {/* 筛选 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label className="form-label">搜索</label>
            <input className="form-input" placeholder="搜索标题..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          </div>
          <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
            <label className="form-label">分类</label>
            <select className="form-input" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">全部分类</option>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" style={{ height: 38 }} onClick={load}>搜索</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {loading ? <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : items.length === 0 ? <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: '#aaa' }}>暂无内容</div>
        : items.map(item => (
          <div key={item._id} className="card">
            <div style={{ padding: '16px 16px 12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span className="badge badge-info">{CAT_LABEL[item.category] || item.category}</span>
                <span style={{ fontSize: 11, color: '#aaa' }}>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{item.title}</h3>
              {item.tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                  {item.tags.map(t => <span key={t} style={{ fontSize: 11, padding: '1px 8px', background: '#f0f4f8', borderRadius: 99, color: '#4A6558' }}>{t}</span>)}
                </div>
              )}
              {item.coverUrl && (
                <img src={item.coverUrl} alt="封面" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 6, marginBottom: 8, display: 'block' }} onError={e => { e.target.style.display = 'none' }} />
              )}
              {item.content && <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, marginBottom: 8 }}>{item.content.length > 80 ? item.content.slice(0, 80) + '...' : item.content}</p>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={() => setPushModal(item)}>📤 推送</button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item._id)}>删除</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreate && <CreateKnowledgeModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); toast('内容已创建'); load() }} />}
      {pushModal && <PushModal item={pushModal} patients={patients} onClose={() => setPushModal(null)} onSaved={(n) => { setPushModal(null); toast(`已推送给 ${n} 位会员`) }} />}
    </div>
  )
}

function CreateKnowledgeModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', category: 'other', content: '', tags: '', coverUrl: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.title) { setError('标题不能为空'); return }
    setSaving(true); setError('')
    try {
      await staffAPI.createKnowledge({ ...form, tags: form.tags ? form.tags.split(/[,，]+/).map(t => t.trim()).filter(Boolean) : [], coverUrl: form.coverUrl?.trim() || '' })
      onSaved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h3 className="modal-title">新增科普内容</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="login-err" style={{ margin: '0 20px 8px' }}>⚠️ {error}</div>}
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">标题 *</label>
            <input className="form-input" placeholder="如：春季养肝饮食建议" value={form.title} onChange={set('title')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">分类</label>
            <select className="form-input" value={form.category} onChange={set('category')}>
              {Object.entries(CAT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">标签（逗号分隔）</label>
            <input className="form-input" placeholder="如：饮食,肝脏,春季" value={form.tags} onChange={set('tags')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">图片URL（可选）</label>
            <input className="form-input" placeholder="https://... 封面图片链接" value={form.coverUrl} onChange={set('coverUrl')} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">内容</label>
            <textarea className="form-input" rows={5} placeholder="文章内容或图文说明..." value={form.content} onChange={set('content')} style={{ resize: 'vertical' }} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? '创建中...' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

function PushModal({ item, patients, onClose, onSaved }) {
  const [selected, setSelected] = useState([])
  const [pushing, setPushing] = useState(false)
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const selectAll = () => setSelected(patients.map(p => p._id))
  const clearAll = () => setSelected([])

  const handlePush = async () => {
    if (!selected.length) return
    setPushing(true)
    try { await staffAPI.pushKnowledge(item._id, selected); onSaved(selected.length) }
    catch { onSaved(selected.length) }
    finally { setPushing(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h3 className="modal-title">推送「{item.title}」</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={selectAll}>全选 ({patients.length})</button>
            <button className="btn btn-secondary btn-sm" onClick={clearAll}>清空</button>
            <span style={{ fontSize: 13, color: '#1E6B50', lineHeight: '28px' }}>已选 {selected.length} 人</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {patients.map(p => (
              <div key={p._id} onClick={() => toggle(p._id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `1px solid ${selected.includes(p._id) ? '#1E6B50' : '#E0D9CE'}`, background: selected.includes(p._id) ? '#E8F5EF' : '#fff', cursor: 'pointer' }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${selected.includes(p._id) ? '#1E6B50' : '#ccc'}`, background: selected.includes(p._id) ? '#1E6B50' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.includes(p._id) && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                </div>
                <span style={{ fontWeight: 500 }}>{p.name}</span>
                <span style={{ fontSize: 12, color: '#aaa' }}>{p.phone}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handlePush} disabled={!selected.length || pushing}>{pushing ? '推送中...' : `推送给 ${selected.length} 人`}</button>
        </div>
      </div>
    </div>
  )
}
