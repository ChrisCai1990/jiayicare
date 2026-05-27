import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const EMPTY = { name: '', bookable: false, sortOrder: 0 }

export default function DepartmentPage() {
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
    adminAPI.departments().then(r => setList(r.data)).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = d => { setEditId(d._id); setForm({ name: d.name, bookable: d.bookable, sortOrder: d.sortOrder }); setError(''); setShowModal(true) }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('部门名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        await adminAPI.updateDept(editId, form)
        toast('部门已更新')
      } else {
        await adminAPI.createDept(form)
        toast('部门已创建')
      }
      setShowModal(false); load()
    } catch (e) {
      setError(e.message || '操作失败')
    } finally { setSaving(false) }
  }

  const handleToggle = async (d) => {
    try { await adminAPI.toggleDept(d._id); load() } catch (e) { toast(e.message) }
  }

  const handleDelete = async (d) => {
    if (!window.confirm(`确定删除部门「${d.name}」？`)) return
    try { await adminAPI.deleteDept(d._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>部门管理</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>自定义企业部门结构</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增部门</button>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无部门，点击右上角新增</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['部门名称', '可预约', '排序', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(d => (
                <tr key={d._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{d.name}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: d.bookable ? '#E8F5EF' : '#F3F4F6', color: d.bookable ? '#1E6B50' : '#6B7280' }}>
                      {d.bookable ? '是' : '否'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{d.sortOrder}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <StatusBadge active={d.status === 'active'} />
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)} style={{ marginRight: 6 }}>编辑</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(d)} style={{ marginRight: 6 }}>
                      {d.status === 'active' ? '停用' : '启用'}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑部门' : '新增部门'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <form onSubmit={handleSave} className="modal-body">
              <div className="form-group">
                <label className="form-label">部门名称 *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="如：医疗服务部" required />
              </div>
              <div className="form-group">
                <label className="form-label">排序权重</label>
                <input className="form-input" type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.bookable} onChange={e => setForm(f => ({ ...f, bookable: e.target.checked }))} />
                  <span className="form-label" style={{ marginBottom: 0 }}>可预约（用于排班/预约业务）</span>
                </label>
              </div>
            </form>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : (editId ? '保存更改' : '创建')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ active }) {
  return (
    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: active ? '#E8F5EF' : '#FEF2F2', color: active ? '#1E6B50' : '#DC2626' }}>
      {active ? '启用' : '停用'}
    </span>
  )
}
