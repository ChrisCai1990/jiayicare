// 共用模板：检验项目/医嘱/套餐/服务项目/其他收费 页面
import React, { useEffect, useState } from 'react'
import { pinyin } from 'pinyin-pro'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

function genMnemonic(name) {
  if (!name) return ''
  try {
    return pinyin(name, { pattern: 'initial', toneType: 'none', type: 'array' })
      .map(s => s[0]?.toUpperCase() || '').join('').replace(/[^A-Z]/g, '')
  } catch { return '' }
}

export function useCategories() {
  const [cats, setCats] = useState([])
  useEffect(() => {
    adminAPI.categories().then(r => {
      const flat = []
      const walk = (nodes, depth = 0) => nodes.forEach(n => { flat.push({ ...n, depth }); walk(n.children || [], depth + 1) })
      walk(r.data || [])
      setCats(flat)
    }).catch(() => {})
  }, [])
  return cats
}

export function StatusBadge({ active }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: active ? '#E8F5EF' : '#FEF2F2', color: active ? '#1E6B50' : '#DC2626' }}>
      {active ? '启用' : '停用'}
    </span>
  )
}

// fields: [{ key, label, type('text'|'number'|'select'), required, options, placeholder }]
export default function ProjectPage({ title, desc, fields, fetchFn, createFn, updateFn, toggleFn, deleteFn, extraFilter }) {
  const toast = useToast()
  const cats = useCategories()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({})
  const [mnemonicEdited, setMnemonicEdited] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasMnemonic = fields.some(f => f.key === 'mnemonic')

  const handleNameChange = (val) => {
    setForm(p => ({
      ...p,
      name: val,
      ...(hasMnemonic && !mnemonicEdited ? { mnemonic: genMnemonic(val) } : {}),
    }))
  }
  const handleMnemonicChange = (val) => {
    setMnemonicEdited(true)
    setForm(p => ({ ...p, mnemonic: val }))
  }

  const buildEmpty = () => {
    const obj = { categoryId: '' }
    fields.forEach(f => { obj[f.key] = f.defaultValue ?? (f.type === 'number' ? 0 : f.type === 'checkbox' ? true : '') })
    return obj
  }

  const load = (p = page) => {
    setLoading(true)
    fetchFn({ q, page: p, limit: 20, ...extraFilter }).then(r => {
      setList(r.data); setTotal(r.total || r.data?.length || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(buildEmpty()); setMnemonicEdited(false); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    const f = { categoryId: item.categoryId?._id || item.categoryId || '' }
    fields.forEach(fd => {
      if (fd.type === 'checkbox') f[fd.key] = item[fd.key] !== false
      else f[fd.key] = item[fd.key] ?? (fd.type === 'number' ? 0 : '')
    })
    setForm(f); setMnemonicEdited(true); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    const reqField = fields.find(f => f.required && !form[f.key]?.toString().trim())
    if (reqField) { setError(`${reqField.label}不能为空`); return }
    setSaving(true); setError('')
    try {
      if (editId) { await updateFn(editId, form); toast('已更新') }
      else { await createFn(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await toggleFn(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return
    try { await deleteFn(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const totalPages = Math.ceil(total / 20)

  // 显示列：name, mnemonic, retailPrice, unit, status
  const tableCols = ['名称', '助记码', '单位', '零售价', '所属分类', '状态', '操作']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h2>
          {desc && <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{desc}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 220 }} placeholder="搜索名称/助记码" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn btn-primary" onClick={openCreate}>＋ 新增</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无数据</div>
          : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {tableCols.map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{item.mnemonic || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.unit || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>¥{item.retailPrice?.toFixed?.(2) || '0.00'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 12 }}>{item.categoryId?.name || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <StatusBadge active={item.status === 'active'} />
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(item)} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '1px solid #E5E7EB', fontSize: 13 }}>
                <span style={{ color: '#6B7280' }}>共 {total} 条</span>
                <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                <span>{page} / {totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? `编辑${title}` : `新增${title}`}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fields.map(f => (
                  <div key={f.key} className="form-group" style={{ marginBottom: 0, gridColumn: f.fullWidth ? 'span 2' : undefined }}>
                    <label className="form-label">{f.label}{f.required ? ' *' : ''}</label>
                    {f.type === 'number' ? (
                      <input className="form-input" type="number" step="0.01" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    ) : f.type === 'textarea' ? (
                      <textarea className="form-input" rows={2} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    ) : f.type === 'select' ? (
                      <select className="form-input" value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}>
                        <option value="">请选择</option>
                        {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : f.type === 'checkbox' ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, marginTop: 8 }}>
                        <input type="checkbox" checked={!!form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.checked }))} />
                        参与商城折扣活动
                      </label>
                    ) : f.key === 'name' ? (
                      <input className="form-input" value={form[f.key] || ''} onChange={e => handleNameChange(e.target.value)} placeholder={f.placeholder} />
                    ) : f.key === 'mnemonic' ? (
                      <input className="form-input" value={form[f.key] || ''} onChange={e => handleMnemonicChange(e.target.value)} placeholder={f.placeholder} style={{ fontFamily: 'monospace' }} />
                    ) : (
                      <input className="form-input" value={form[f.key] || ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                    )}
                  </div>
                ))}
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">所属分类</label>
                  <select className="form-input" value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
                    <option value="">无</option>
                    {cats.map(c => <option key={c._id} value={c._id}>{'　'.repeat(c.depth)}{c.name}</option>)}
                  </select>
                </div>
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
