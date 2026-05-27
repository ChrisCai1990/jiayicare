import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

// ─── 共用：简单列表管理组件（标签/来源） ─────────────────────────
function SimpleListTab({ title, desc, fetchFn, createFn, updateFn, toggleFn, deleteFn }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    fetchFn().then(r => setList(r.data)).catch(e => toast(e.message)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openCreate = () => { setEditId(null); setName(''); setError(''); setShowModal(true) }
  const openEdit = item => { setEditId(item._id); setName(item.name); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!name.trim()) { setError('名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await updateFn(editId, { name }); toast('已更新') }
      else { await createFn({ name }); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message || '操作失败') }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await toggleFn(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return
    try { await deleteFn(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280' }}>{desc}</p>
        <button className="btn btn-primary btn-sm" onClick={openCreate}>＋ 新增</button>
      </div>
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : list.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无数据</div>
        : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['名称', '状态', '操作'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map(item => (
              <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: item.status === 'active' ? '#E8F5EF' : '#FEF2F2', color: item.status === 'active' ? '#1E6B50' : '#DC2626' }}>
                    {item.status === 'active' ? '启用' : '停用'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 6 }}>编辑</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(item)} style={{ marginRight: 6 }}>{item.status === 'active' ? '停用' : '启用'}</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 360 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑' : '新增'}{title}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">名称 *</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
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

// ─── 会员类型（树形） ──────────────────────────────────────────
function MemberTypeTab() {
  const toast = useToast()
  const [treeData, setTreeData] = useState([])
  const [flatList, setFlatList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', parent: '', sortOrder: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminAPI.memberTypesTree().then(r => {
      setTreeData(r.data)
      // 展开为平铺列表
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
    if (!form.name.trim()) { setError('类型名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateMemberTypeTree(editId, form); toast('已更新') }
      else { await adminAPI.createMemberTypeTree(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await adminAPI.toggleMemberTypeTree(item._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？子类目也将被删除。`)) return
    try { await adminAPI.deleteMemberTypeTree(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const renderTree = (nodes, depth = 0) => nodes.map(n => (
    <React.Fragment key={n._id}>
      <tr style={{ borderBottom: '1px solid #F3F4F6' }}>
        <td style={{ padding: '10px 14px', paddingLeft: 14 + depth * 24 }}>
          <span style={{ color: depth > 0 ? '#6B7280' : undefined }}>
            {depth > 0 ? '└ ' : ''}{n.name}
          </span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: n.active ? '#E8F5EF' : '#FEF2F2', color: n.active ? '#1E6B50' : '#DC2626' }}>
            {n.active ? '启用' : '停用'}
          </span>
        </td>
        <td style={{ padding: '10px 14px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => openCreate(n._id)} style={{ marginRight: 4 }}>＋子类目</button>
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(n)} style={{ marginRight: 4 }}>编辑</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(n)} style={{ marginRight: 4 }}>{n.active ? '停用' : '启用'}</button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(n)}>删除</button>
        </td>
      </tr>
      {n.children?.length > 0 && renderTree(n.children, depth + 1)}
    </React.Fragment>
  ))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: '#6B7280' }}>定义会员等级/类型，支持多层子类目树形结构</p>
        <button className="btn btn-primary btn-sm" onClick={() => openCreate()}>＋ 新增顶级类型</button>
      </div>
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        : treeData.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#aaa' }}>暂无类型</div>
        : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['类型名称', '状态', '操作'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{renderTree(treeData)}</tbody>
        </table>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑类型' : (form.parent ? '新增子类目' : '新增顶级类型')}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">类型名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">父级类型</label>
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

// ─── 主页面（3个 Tab） ─────────────────────────────────────────
const TABS = ['会员标签', '会员来源', '会员类型']

export default function MemberSettingsPage() {
  const [tab, setTab] = useState(0)

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>会员设置</h2>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '2px solid #E5E7EB' }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              padding: '10px 24px', fontSize: 14, fontWeight: 500, border: 'none', background: 'none', cursor: 'pointer',
              color: tab === i ? '#1E6B50' : '#6B7280',
              borderBottom: tab === i ? '2px solid #1E6B50' : '2px solid transparent',
              marginBottom: -2,
            }}
          >{t}</button>
        ))}
      </div>

      <div className="card" style={{ borderTopLeftRadius: 0, marginTop: 0 }}>
        {tab === 0 && (
          <SimpleListTab
            title="会员标签"
            desc="自定义会员标签，用于分类、筛选、营销"
            fetchFn={adminAPI.memberTags}
            createFn={adminAPI.createMemberTag}
            updateFn={adminAPI.updateMemberTag}
            toggleFn={adminAPI.toggleMemberTag}
            deleteFn={adminAPI.deleteMemberTag}
          />
        )}
        {tab === 1 && (
          <SimpleListTab
            title="会员来源"
            desc='定义会员的渠道来源，如"线上注册""线下活动""推荐"'
            fetchFn={adminAPI.memberSources}
            createFn={adminAPI.createMemberSource}
            updateFn={adminAPI.updateMemberSource}
            toggleFn={adminAPI.toggleMemberSource}
            deleteFn={adminAPI.deleteMemberSource}
          />
        )}
        {tab === 2 && <MemberTypeTab />}
      </div>
    </div>
  )
}
