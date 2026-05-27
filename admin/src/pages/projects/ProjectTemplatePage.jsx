import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const TEMPLATE_TYPES = ['体检方案', '健康管理方案', '营养干预方案', '其他']

const EMPTY = { name: '', templateType: '', items: [] }

export default function ProjectTemplatePage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminAPI.projectTemplates().then(r => setList(r.data)).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = t => { setEditId(t._id); setForm({ name: t.name, templateType: t.templateType || '', items: t.items || [] }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('模板名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateProjectTemplate(editId, form); toast('已更新') }
      else { await adminAPI.createProjectTemplate(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async t => {
    if (!window.confirm(`确定删除模板「${t.name}」？`)) return
    try { await adminAPI.deleteProjectTemplate(t._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>项目模板</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>预定义常用项目组合，方便快速创建健康方案</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增模板</button>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无模板</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['模板名称', '模板类型', '项目数', '创建时间', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(t => (
                <tr key={t._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{t.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{t.templateType || '-'}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{t.items?.length || 0} 项</td>
                  <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} style={{ marginRight: 6 }}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑模板' : '新增模板'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">模板名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">模板类型</label>
                <select className="form-input" value={form.templateType} onChange={e => setForm(f => ({ ...f, templateType: e.target.value }))}>
                  <option value="">请选择</option>
                  {TEMPLATE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF' }}>
                提示：模板中的具体项目可在创建健康方案时进一步调整
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : (editId ? '保存' : '创建')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
