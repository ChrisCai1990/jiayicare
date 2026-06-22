import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const FIELD_TYPES = [
  { value: 'text',     label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number',   label: '数值' },
  { value: 'radio',    label: '单选' },
  { value: 'checkbox', label: '多选' },
  { value: 'date',     label: '日期' },
]

const EMPTY_FIELD = { type: 'text', label: '', required: false, options: [] }
const EMPTY_FORM = { name: '', fields: [] }

export default function FollowUpFormPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

  const load = () => {
    setLoading(true)
    adminAPI.followupForms().then(r => setList(r.data)).catch(e => toast(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setError(''); setShowModal(true) }
  const openEdit = f => { setEditId(f._id); setForm({ name: f.name, fields: f.fields?.map(fd => ({ ...fd, options: fd.options || [] })) || [] }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('表单名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateFollowupForm(editId, form); toast('已更新') }
      else { await adminAPI.createFollowupForm(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await adminAPI.toggleFollowupForm(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除表单「${item.name}」？`)) return
    try { await adminAPI.deleteFollowupForm(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  // 字段操作
  const addField = () => setForm(f => ({ ...f, fields: [...f.fields, { ...EMPTY_FIELD }] }))
  const removeField = idx => setForm(f => ({ ...f, fields: f.fields.filter((_, i) => i !== idx) }))
  const updateField = (idx, key, val) => setForm(f => ({
    ...f,
    fields: f.fields.map((fd, i) => i === idx ? { ...fd, [key]: val } : fd)
  }))
  const moveField = (idx, dir) => {
    const arr = [...form.fields]
    const target = idx + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
    setForm(f => ({ ...f, fields: arr }))
  }

  const filtered = list.filter(item => !search || item.name?.includes(search))
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>随访表单</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>自定义随访记录表单模板，供医护端随访时填写</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增表单</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input style={{ flex: 1, maxWidth: 280, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13 }}
          placeholder="搜索表单名称..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13 }}
          value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
          <option value={10}>10条/页</option>
          <option value={20}>20条/页</option>
          <option value={30}>30条/页</option>
        </select>
        <span style={{ fontSize: 12, color: '#6B7280' }}>共 {filtered.length} 条</span>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : paged.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无随访表单</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['表单名称', '字段数', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.fields?.length || 0} 个字段</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: item.status === 'active' ? '#E8F5EF' : '#FEF2F2', color: item.status === 'active' ? '#1E6B50' : '#DC2626' }}>
                      {item.status === 'active' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(item)} style={{ marginRight: 4 }}>{item.status === 'active' ? '停用' : '启用'}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 13, color: '#6B7280' }}>第 {page} / {totalPages} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑随访表单' : '新增随访表单'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">表单名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>字段设计（{form.fields.length} 个）</span>
                <button className="btn btn-secondary btn-sm" onClick={addField}>＋ 添加字段</button>
              </div>

              {form.fields.length === 0 && (
                <div style={{ padding: '20px', textAlign: 'center', color: '#aaa', border: '1px dashed #E5E7EB', borderRadius: 8, fontSize: 13 }}>
                  点击"添加字段"开始设计表单
                </div>
              )}

              {form.fields.map((fd, idx) => (
                <div key={idx} style={{ border: '1px solid #E5E7EB', borderRadius: 8, padding: 12, marginBottom: 8, background: '#FAFAFA' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: 11 }}>字段标签</label>
                      <input className="form-input" style={{ fontSize: 13 }} value={fd.label} onChange={e => updateField(idx, 'label', e.target.value)} placeholder="字段名称" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: 11 }}>字段类型</label>
                      <select className="form-input" style={{ fontSize: 13 }} value={fd.type} onChange={e => updateField(idx, 'type', e.target.value)}>
                        {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {(fd.type === 'radio' || fd.type === 'checkbox') && (
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label className="form-label" style={{ fontSize: 11 }}>选项（用逗号分隔）</label>
                      <input
                        className="form-input" style={{ fontSize: 13 }}
                        value={fd.options?.join(',') || ''}
                        onChange={e => updateField(idx, 'options', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        placeholder="如：好转,无变化,加重"
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <input type="checkbox" checked={fd.required} onChange={e => updateField(idx, 'required', e.target.checked)} />
                      必填
                    </label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(idx, -1)} disabled={idx === 0}>↑</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveField(idx, 1)} disabled={idx === form.fields.length - 1}>↓</button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeField(idx)}>删除</button>
                    </div>
                  </div>
                </div>
              ))}
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
