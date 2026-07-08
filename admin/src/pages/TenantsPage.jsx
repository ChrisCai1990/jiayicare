import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin, useToast } from '../App'

const STATUS_LABEL = { active: '运营中', suspended: '已暂停' }
const EMPTY = { code: '', name: '', slogan: '', themeColor: '#1E6B50', adminUsername: '', adminPassword: '' }

export default function TenantsPage() {
  const { admin } = useAdmin()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)   // null=新建
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const isPlatform = admin?.role === 'platformSuper'

  const load = async () => {
    setLoading(true)
    try { const res = await adminAPI.tenants(); setList(res.data || []) }
    catch (err) { toast('❌ ' + (err.message || '加载失败')) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (isPlatform) load() }, [])

  const openCreate = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (t) => { setEditing(t); setForm({ code: t.code, name: t.name, slogan: t.slogan || '', themeColor: t.themeColor || '#1E6B50', status: t.status, adminUsername: '', adminPassword: '' }); setShowModal(true) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.code || !form.name) { toast('❌ 机构标识和名称必填'); return }
    setSaving(true)
    try {
      if (editing) await adminAPI.updateTenant(editing._id, { name: form.name, slogan: form.slogan, themeColor: form.themeColor, status: form.status })
      else await adminAPI.createTenant(form)
      toast(editing ? '✅ 机构已更新' : '✅ 机构创建成功')
      setShowModal(false); load()
    } catch (err) { toast('❌ ' + (err.message || '操作失败')) } finally { setSaving(false) }
  }

  const del = async (t) => {
    if (!window.confirm(`删除机构「${t.name}」？（有员工或客户时不可删）`)) return
    try { await adminAPI.deleteTenant(t._id); toast('✅ 已删除'); load() }
    catch (err) { toast('❌ ' + (err.message || '删除失败')) }
  }

  if (!isPlatform) {
    return <div className="page"><div className="card" style={{ padding: 32, color: '#c00' }}>仅平台超管可访问机构管理</div></div>
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏛️ 机构管理</h1>
          <p className="page-subtitle">多机构 SaaS 运营 · 每家机构数据相互隔离</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新建机构</button>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无机构，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={openCreate}>点击创建</span></div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['机构名称', '标识', '员工数', '客户数', '状态', '创建时间', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(t => (
                <tr key={t._id}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: t.themeColor || '#1E6B50', marginRight: 8 }} />
                    {t.name}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontFamily: 'monospace' }}>{t.code}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{t.staffCount ?? 0}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{t.userCount ?? 0}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: t.status === 'active' ? '#E8F5EF' : '#FEECEC', color: t.status === 'active' ? '#1E6B50' : '#c0392b' }}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 12 }}>{new Date(t.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} style={{ marginRight: 6 }}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(t)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? '编辑机构' : '新建机构'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">机构名称 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} placeholder="如：华东康养中心" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">机构标识 *（英文/拼音，创建后不可改）</label>
                  <input className="form-input" value={form.code} onChange={set('code')} placeholder="如 huadong" disabled={!!editing} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">主题色</label>
                  <input className="form-input" type="color" value={form.themeColor} onChange={set('themeColor')} style={{ height: 38, padding: 4 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">品牌标语</label>
                  <input className="form-input" value={form.slogan} onChange={set('slogan')} placeholder="选填" />
                </div>
                {editing && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">状态</label>
                    <select className="form-input" value={form.status} onChange={set('status')}>
                      <option value="active">运营中</option>
                      <option value="suspended">已暂停</option>
                    </select>
                  </div>
                )}
                {!editing && (
                  <>
                    <div style={{ gridColumn: 'span 2', fontSize: 12, color: '#8A6D3B', background: '#FFFDF7', padding: '8px 12px', borderRadius: 6 }}>
                      为新机构创建一个超级管理员账号（该机构自己登录管理用）。留空则暂不创建，之后需另行添加。
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">机构管理员用户名</label>
                      <input className="form-input" value={form.adminUsername} onChange={set('adminUsername')} placeholder="登录用" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">管理员初始密码</label>
                      <input className="form-input" type="text" value={form.adminPassword} onChange={set('adminPassword')} placeholder="至少6位" />
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : (editing ? '保存' : '创建机构')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
