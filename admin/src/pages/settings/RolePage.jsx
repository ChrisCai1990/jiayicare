import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

// 医护端（staff portal）功能模块权限配置
const MODULES = [
  { key: 'patients',        label: '我的会员',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'followups',       label: '随访管理',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'plans',           label: '健康方案',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'reports',         label: '报告管理',     actions: ['view', 'audit', 'delete'] },
  { key: 'abnormal_review', label: '异常复查',     actions: ['view', 'create', 'edit'] },
  { key: 'service_records', label: '服务记录',     actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'knowledge',       label: '科普推送',     actions: ['view', 'send'] },
  { key: 'questionnaires',  label: '问卷推送',     actions: ['view', 'send'] },
  { key: 'products',        label: '产品推送',     actions: ['view', 'send'] },
  { key: 'commission',      label: '分佣中心',     actions: ['view'] },
  { key: 'marketing',       label: '会员营销',     actions: ['view', 'create'] },
  { key: 'team',            label: '团队管理',     actions: ['view', 'create', 'edit'] },
  { key: 'operations',      label: '运营看板',     actions: ['view'] },
  { key: 'daily_checkin',   label: '日常健康打卡', actions: ['view'] },
]

const ACTION_LABEL = { view: '查看', create: '新增', edit: '编辑', delete: '删除', send: '推送', audit: '审核' }

function buildEmptyPermissions() {
  const perms = {}
  MODULES.forEach(m => {
    perms[m.key] = {}
    m.actions.forEach(a => { perms[m.key][a] = false })
  })
  return perms
}

export default function RolePage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [name, setName] = useState('')
  const [permissions, setPermissions] = useState(buildEmptyPermissions())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    adminAPI.roles().then(r => setList(r.data)).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditId(null); setName(''); setPermissions(buildEmptyPermissions()); setError(''); setShowModal(true)
  }

  const openEdit = r => {
    setEditId(r._id); setName(r.name)
    const p = buildEmptyPermissions()
    if (r.permissions) {
      MODULES.forEach(m => {
        if (r.permissions[m.key]) {
          m.actions.forEach(a => { p[m.key][a] = !!r.permissions[m.key][a] })
        }
      })
    }
    setPermissions(p); setError(''); setShowModal(true)
  }

  const togglePerm = (module, action) => {
    setPermissions(p => ({
      ...p,
      [module]: { ...p[module], [action]: !p[module][action] }
    }))
  }

  const toggleAllModule = (module) => {
    const m = MODULES.find(x => x.key === module)
    const allOn = m.actions.every(a => permissions[module][a])
    setPermissions(p => ({
      ...p,
      [module]: Object.fromEntries(m.actions.map(a => [a, !allOn]))
    }))
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('角色名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) {
        await adminAPI.updateRole(editId, { name, permissions })
        toast('角色已更新')
      } else {
        await adminAPI.createRole({ name, permissions })
        toast('角色已创建')
      }
      setShowModal(false); load()
    } catch (e) {
      setError(e.message || '操作失败')
    } finally { setSaving(false) }
  }

  const handleDelete = async (r) => {
    if (!window.confirm(`确定删除角色「${r.name}」？`)) return
    try { await adminAPI.deleteRole(r._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>角色管理</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>定义系统权限角色，配置各模块访问权限</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增角色</button>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无自定义角色</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['角色名称', '创建时间', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(r => (
                <tr key={r._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{r.name}</td>
                  <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)} style={{ marginRight: 6 }}>编辑权限</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑角色' : '新增角色'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">角色名称 *</label>
                <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="如：总经理、区域经理、家庭医生" />
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, color: '#374151' }}>权限配置</div>
              <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      <th style={{ padding: '8px 12px', fontSize: 12, color: '#6B7280', textAlign: 'left', width: 120 }}>模块</th>
                      <th style={{ padding: '8px 12px', fontSize: 12, color: '#6B7280', textAlign: 'left' }}>权限</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map(m => {
                      const allOn = m.actions.every(a => permissions[m.key]?.[a])
                      return (
                        <tr key={m.key} style={{ borderTop: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 500, verticalAlign: 'middle' }}>
                            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input type="checkbox" checked={allOn} onChange={() => toggleAllModule(m.key)} />
                              {m.label}
                            </label>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              {m.actions.map(a => (
                                <label key={a} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                                  <input
                                    type="checkbox"
                                    checked={!!permissions[m.key]?.[a]}
                                    onChange={() => togglePerm(m.key, a)}
                                  />
                                  {ACTION_LABEL[a] || a}
                                </label>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : (editId ? '保存更改' : '创建角色')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
