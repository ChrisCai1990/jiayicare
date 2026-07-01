import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

export default function CategoryPage() {
  const toast = useToast()
  const [treeData, setTreeData] = useState([])
  const [flatList, setFlatList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', parent: '', sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const load = () => {
    setLoading(true)
    adminAPI.categories().then(r => {
      setTreeData(r.data)
      const flat = []
      const walk = (nodes, depth = 0) => nodes.forEach(n => { flat.push({ ...n, depth }); walk(n.children || [], depth + 1) })
      walk(r.data)
      setFlatList(flat)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = (parentId = '') => {
    setEditId(null); setForm({ name: '', parent: parentId, sortOrder: 0 }); setError(''); setShowModal(true)
  }
  const openEdit = item => {
    setEditId(item._id); setForm({ name: item.name, parent: item.parent || '', sortOrder: item.sortOrder || 0 }); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('分类名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateCategory(editId, form); toast('分类已更新') }
      else { await adminAPI.createCategory(form); toast('分类已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除分类「${item.name}」？`)) return
    try { await adminAPI.deleteCategory(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const filterTree = (nodes, q) => {
    const query = q.trim().toLowerCase()
    if (!query) return nodes
    return nodes.reduce((acc, n) => {
      const children = filterTree(n.children || [], q)
      const selfMatch = n.name.toLowerCase().includes(query)
      if (selfMatch || children.length > 0) acc.push({ ...n, children })
      return acc
    }, [])
  }
  const displayData = search.trim() ? filterTree(treeData, search) : treeData

  const renderTree = (nodes, depth = 0) => nodes.map(n => (
    <React.Fragment key={n._id}>
      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
        <td style={{ padding: '10px 14px', paddingLeft: 14 + depth * 24 }}>
          {depth > 0 && <span style={{ color: '#D1D5DB', marginRight: 4 }}>└</span>}
          <span style={{ fontWeight: depth === 0 ? 600 : 400 }}>{n.name}</span>
        </td>
        <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 12 }}>{n.sortOrder}</td>
        <td style={{ padding: '10px 14px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openCreate(n._id)} style={{ marginRight: 4 }}>＋子分类</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(n)} style={{ marginRight: 4 }}>编辑</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(n)}>删除</button>
        </td>
      </tr>
      {n.children?.length > 0 && renderTree(n.children, depth + 1)}
    </React.Fragment>
  ))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>分类管理</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>为检验/服务项目设置多级分类</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate()}>＋ 新增顶级分类</button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="搜索分类名称"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : treeData.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无分类</div>
          : displayData.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>没有匹配「{search}」的分类</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['分类名称', '排序', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{renderTree(displayData)}</tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑分类' : '新增分类'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">分类名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">父级分类</label>
                <select className="form-input" value={form.parent} onChange={e => setForm(f => ({ ...f, parent: e.target.value }))}>
                  <option value="">无（顶级）</option>
                  {flatList.filter(n => n._id !== editId).map(n => (
                    <option key={n._id} value={n._id}>{'　'.repeat(n.depth)}{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">排序权重</label>
                <input className="form-input" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
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
