import React, { useEffect, useState } from 'react'
import { adminAPI } from '../api'
import { useAdmin, useToast } from '../App'

const ROLE_LABEL = {
  familyDoctor:    '家庭医生',
  nutritionist:    '营养师',
  healthManager:   '健管专员',
  medicalAssistant:'就医专员',
  psychologist:    '心理咨询师',
  rehabSpecialist: '运动复健师',
  tcmDoctor:       '中医师',
  specialist:      '专科医师',
  healthPlanner:   '健康规划师',
}

const STAFF_ROLES = Object.keys(ROLE_LABEL)

const EMPTY_FORM = {
  username: '', password: '', name: '', role: 'healthManager',
  title: '', department: '', region: '', phone: '', teamId: '',
}

export default function StaffPage() {
  const { admin } = useAdmin()
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [teams, setTeams] = useState([])
  const [showTeamMgr, setShowTeamMgr] = useState(false)

  const isSuperAdmin = admin?.role === 'superadmin'

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminAPI.staffList()
      setList(res.data)
    } catch (err) {
      toast(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadTeams = async () => {
    try {
      const res = await adminAPI.teams()
      setTeams(res.data || [])
    } catch { /* 团队功能可选，加载失败不阻塞员工管理 */ }
  }

  useEffect(() => { load(); loadTeams() }, [])

  const teamName = (id) => teams.find(t => String(t._id) === String(id))?.name || '-'

  const openCreate = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowModal(true)
  }

  const openEdit = (s) => {
    setEditId(s._id)
    setForm({ username: s.username, password: '', name: s.name, role: s.role, title: s.title || '', department: s.department || '', region: s.region || '', phone: s.phone || '', teamId: s.teamId ? String(s.teamId) : '' })
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editId && (!form.username || !form.password || !form.name)) {
      setError('用户名、密码、姓名不能为空')
      return
    }
    if (!form.phone) {
      setError('手机号不能为空（作为唯一识别码）')
      return
    }
    if (!/^1[3-9]\d{9}$/.test(form.phone)) {
      setError('手机号格式不正确')
      return
    }
    setSaving(true)
    setError('')
    try {
      if (editId) {
        const payload = { name: form.name, role: form.role, title: form.title, department: form.department, region: form.region, phone: form.phone, teamId: form.teamId || null }
        if (form.password) payload.password = form.password
        await adminAPI.updateStaff(editId, payload)
        toast('账号已更新')
      } else {
        await adminAPI.createStaff(form)
        toast('账号已创建')
      }
      setShowModal(false)
      load()
    } catch (err) {
      setError(err.message || '操作失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`确定要删除账号「${name}」吗？此操作不可恢复。`)) return
    try {
      await adminAPI.deleteStaff(id)
      toast('账号已删除')
      load()
    } catch (err) {
      toast(err.message || '删除失败')
    }
  }

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>医护账号管理</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>管理医护端登录账号（健管专员、家庭医生等）</p>
        </div>
        {isSuperAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowTeamMgr(true)}>🫂 团队管理</button>
            <button className="btn btn-primary" onClick={openCreate}>＋ 新建账号</button>
          </div>
        )}
      </div>

      {!isSuperAdmin && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
          ⚠️ 仅超级管理员可创建/修改/删除医护账号
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
        ) : list.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            暂无医护账号，{isSuperAdmin ? <span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={openCreate}>点击创建</span> : '请联系超级管理员创建'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['姓名', '手机号', '用户名', '角色', '所属团队', '职称', '部门', '地区', '创建时间', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s._id}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{s.phone || '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontFamily: 'monospace' }}>{s.username}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: '#E8F5EF', color: '#1E6B50'
                    }}>
                      {ROLE_LABEL[s.role] || s.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{s.teamId ? teamName(s.teamId) : '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{s.title || '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{s.department || '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{s.region || '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#9CA3AF', fontSize: 12 }}>
                    {new Date(s.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {isSuperAdmin && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(s)} style={{ marginRight: 6 }}>编辑</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s._id, s.name)}>删除</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑医护账号' : '新建医护账号'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <form onSubmit={handleSave} className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">姓名 *</label>
                  <input className="form-input" placeholder="真实姓名" value={form.name} onChange={set('name')} required />
                </div>
                {!editId && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">用户名 *（登录用）</label>
                    <input className="form-input" placeholder="字母数字组合" value={form.username} onChange={set('username')} required />
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">{editId ? '密码（留空则不修改）' : '密码 *'}</label>
                  <input className="form-input" type="password" placeholder={editId ? '输入新密码' : '至少6位'} value={form.password} onChange={set('password')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">角色 *</label>
                  <select className="form-input" value={form.role} onChange={set('role')}>
                    {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">所属团队</label>
                  <select className="form-input" value={form.teamId} onChange={set('teamId')}>
                    <option value="">不属于任何团队</option>
                    {teams.map(t => <option key={t._id} value={t._id}>{t.name}{t.mentorId?.name ? `（导师：${t.mentorId.name}）` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">职称</label>
                  <input className="form-input" placeholder="如：主任医师" value={form.title} onChange={set('title')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">部门</label>
                  <input className="form-input" placeholder="所属部门" value={form.department} onChange={set('department')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">负责区域</label>
                  <input className="form-input" placeholder="如：北京区" value={form.region} onChange={set('region')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">手机号 *（唯一识别码）</label>
                  <input className="form-input" type="tel" placeholder="11位手机号" value={form.phone} onChange={set('phone')} required />
                </div>
              </div>
            </form>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : (editId ? '保存更改' : '创建账号')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTeamMgr && (
        <TeamManagerModal
          teams={teams}
          staffList={list}
          onClose={() => setShowTeamMgr(false)}
          onChanged={() => { loadTeams(); load() }}
          toast={toast}
        />
      )}
    </div>
  )
}

// ── 团队管理弹窗：新建/编辑/删除团队 + 指定导师 ──────────────────────
function TeamManagerModal({ teams, staffList, onClose, onChanged, toast }) {
  const [name, setName] = useState('')
  const [mentorId, setMentorId] = useState('')
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setMentorId(''); setEditId(null) }

  const submit = async () => {
    if (!name.trim()) { toast('请填写团队名称'); return }
    setSaving(true)
    try {
      if (editId) await adminAPI.updateTeam(editId, { name: name.trim(), mentorId: mentorId || null })
      else await adminAPI.createTeam({ name: name.trim(), mentorId: mentorId || null })
      toast(editId ? '团队已更新' : '团队已创建')
      reset()
      onChanged()
    } catch (err) { toast(err.message || '操作失败') } finally { setSaving(false) }
  }

  const startEdit = (t) => { setEditId(t._id); setName(t.name); setMentorId(t.mentorId?._id ? String(t.mentorId._id) : '') }

  const del = async (t) => {
    if (!window.confirm(`删除团队「${t.name}」？成员的团队归属会被清空（不会删除成员账号）。`)) return
    try { await adminAPI.deleteTeam(t._id); toast('团队已删除'); if (editId === t._id) reset(); onChanged() }
    catch (err) { toast(err.message || '删除失败') }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h3 className="modal-title">团队管理</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 1.6 }}>
            设置团队并指定导师后，<b>导师能查看本团队全部成员名下的客户档案</b>（用于带教/质量把控），普通成员仍只看自己名下客户。
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.4fr auto', gap: 8, alignItems: 'end', marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">团队名称</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="如：华北一组" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">导师</label>
              <select className="form-input" value={mentorId} onChange={e => setMentorId(e.target.value)}>
                <option value="">暂不指定</option>
                {staffList.map(s => <option key={s._id} value={s._id}>{s.name}（{ROLE_LABEL[s.role] || s.role}）</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{editId ? '保存' : '新建'}</button>
              {editId && <button className="btn btn-ghost" onClick={reset}>取消</button>}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['团队', '导师', '成员数', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#aaa' }}>暂无团队</td></tr>
              ) : teams.map(t => (
                <tr key={t._id}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.name}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{t.mentorId?.name || '未指定'}</td>
                  <td style={{ padding: '10px 12px', color: '#6B7280' }}>{t.memberCount ?? 0}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => startEdit(t)} style={{ marginRight: 6 }}>编辑</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(t)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
