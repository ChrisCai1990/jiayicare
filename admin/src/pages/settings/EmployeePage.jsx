import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useAdmin, useToast } from '../../App'

const SYSTEM_ROLE_LABEL = {
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

const EMPTY_PERFORMANCE_RULE = { ruleType: 'none', referrerRate: 0, fulfillerRate: 0, referrerAmount: 0, fulfillerAmount: 0 }

const EMPTY_FORM = {
  username: '', password: '', name: '', role: 'healthManager',
  phone: '', title: '', email: '', certNumber: '', deptId: '', customRoleId: '',
  personalPerformanceRule: EMPTY_PERFORMANCE_RULE,
  teamId: '', mentorOfTeamId: '',
}

// 个人绩效比例：优先于产品全局比例——同岗位不同人可以有不同分佣比例
// （如基础薪酬高的人绩效比例相应调低），不设置则该员工按产品全局比例结算。
function PersonalPerformanceRuleForm({ rule, onChange }) {
  const r = rule || EMPTY_PERFORMANCE_RULE
  const set = (k, v) => onChange({ ...r, [k]: v })

  return (
    <div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">个人绩效比例</label>
        <select className="form-input" value={r.ruleType} onChange={e => set('ruleType', e.target.value)}>
          <option value="none">不设置（按产品全局比例结算，默认）</option>
          <option value="percentage">按比例分配（覆盖产品比例）</option>
          <option value="fixedAmount">按固定金额分配（覆盖产品比例）</option>
        </select>
        <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>
          同岗位不同人可设不同比例，如基础薪酬更高的员工可调低个人绩效比例
        </div>
      </div>

      {r.ruleType === 'percentage' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">作为转介绍人比例（%）</label>
            <input className="form-input" type="number" min="0" max="100" value={r.referrerRate}
              onChange={e => set('referrerRate', parseFloat(e.target.value) || 0)} placeholder="0" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">作为服务人比例（%）</label>
            <input className="form-input" type="number" min="0" max="100" value={r.fulfillerRate}
              onChange={e => set('fulfillerRate', parseFloat(e.target.value) || 0)} placeholder="0" />
          </div>
        </div>
      )}

      {r.ruleType === 'fixedAmount' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">作为转介绍人固定金额（¥）</label>
            <input className="form-input" type="number" min="0" value={r.referrerAmount}
              onChange={e => set('referrerAmount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">作为服务人固定金额（¥）</label>
            <input className="form-input" type="number" min="0" value={r.fulfillerAmount}
              onChange={e => set('fulfillerAmount', parseFloat(e.target.value) || 0)} placeholder="0.00" />
          </div>
        </div>
      )}
    </div>
  )
}

export default function EmployeePage() {
  const { admin } = useAdmin()
  const toast = useToast()
  const [list, setList] = useState([])
  const [depts, setDepts] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [resetTargetId, setResetTargetId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [newPwd, setNewPwd] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [teams, setTeams] = useState([])
  const [showTeamMgr, setShowTeamMgr] = useState(false)

  const isSuperAdmin = admin?.role === 'superadmin'

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      adminAPI.employees({ q }),
      adminAPI.departments(),
      adminAPI.roles(),
    ]).then(([empRes, deptRes, roleRes]) => {
      setList(empRes.data)
      setDepts(deptRes.data)
      setRoles(roleRes.data)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  const loadTeams = async () => {
    try {
      const res = await adminAPI.teams()
      setTeams(res.data || [])
    } catch { /* 团队功能可选，加载失败不阻塞员工管理 */ }
  }

  useEffect(() => { loadAll() }, [q])
  useEffect(() => { loadTeams() }, [])

  const openCreate = () => {
    setEditId(null); setForm(EMPTY_FORM); setError(''); setShowModal(true)
  }

  const openEdit = emp => {
    setEditId(emp._id)
    const mentorTeam = teams.find(t => String(t.mentorId?._id || t.mentorId) === String(emp._id))
    setForm({
      username: emp.username, password: '',
      name: emp.name, role: emp.role,
      phone: emp.phone || '',
      title: emp.title || '', email: emp.email || '',
      certNumber: emp.certNumber || '',
      deptId: emp.deptId?._id || emp.deptId || '',
      customRoleId: emp.customRoleId?._id || emp.customRoleId || '',
      personalPerformanceRule: emp.personalPerformanceRule || EMPTY_PERFORMANCE_RULE,
      teamId: emp.teamId?._id || emp.teamId || '',
      mentorOfTeamId: mentorTeam ? String(mentorTeam._id) : '',
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!editId && (!form.phone || !form.password || !form.name)) {
      setError('手机号码、密码、姓名不能为空'); return
    }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (editId && !payload.password) delete payload.password
      if (editId) {
        await adminAPI.updateEmployee(editId, payload)
        toast('员工信息已更新')
      } else {
        await adminAPI.createEmployee(payload)
        toast('员工账号已创建')
      }
      setShowModal(false); setForm(EMPTY_FORM); setEditId(null); loadAll(); loadTeams()
    } catch (e) {
      setError(e.message || '操作失败')
    } finally { setSaving(false) }
  }

  const handleToggle = async (emp) => {
    try { await adminAPI.toggleEmployee(emp._id); loadAll() } catch (e) { toast(e.message) }
  }

  const handleDelete = async (emp) => {
    if (!window.confirm(`确定删除员工「${emp.name}」的账号？此操作不可恢复。`)) return
    try { await adminAPI.deleteEmployee(emp._id); toast('已删除'); loadAll() } catch (e) { toast(e.message) }
  }

  const openResetPwd = (emp) => { setResetTargetId(emp._id); setNewPwd(''); setShowResetModal(true) }

  const handleResetPwd = async () => {
    if (!newPwd || newPwd.length < 6) { toast('密码不能少于6位'); return }
    try {
      await adminAPI.resetEmpPassword(resetTargetId, newPwd)
      toast('密码已重置'); setShowResetModal(false)
    } catch (e) { toast(e.message) }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>员工管理</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>管理所有医护端/后台登录账号</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            className="form-input"
            style={{ width: 220 }}
            placeholder="搜索姓名或用户名"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {isSuperAdmin && <button className="btn btn-secondary" onClick={() => setShowTeamMgr(true)}>🫂 团队管理</button>}
          {isSuperAdmin && <button className="btn btn-primary" onClick={openCreate}>＋ 新建员工</button>}
        </div>
      </div>

      {!isSuperAdmin && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
          ⚠️ 仅超级管理员可创建/修改/删除员工账号
        </div>
      )}

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无员工账号</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['姓名', '用户名', '系统角色', '自定义角色', '所属团队', '部门', '联系方式', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(emp => (
                <tr key={emp._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                    {emp.name}
                    {emp.title && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{emp.title}</div>}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontFamily: 'monospace' }}>{emp.username}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: '#E8F5EF', color: '#1E6B50' }}>
                      {SYSTEM_ROLE_LABEL[emp.role] || emp.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontSize: 13 }}>
                    {emp.customRoleId?.name || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontSize: 13 }}>
                    {emp.teamId?.name || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6B7280' }}>{emp.deptId?.name || '-'}</td>
                  <td style={{ padding: '12px 14px', color: '#6B7280', fontSize: 12 }}>
                    {emp.phone && <div style={{ fontWeight: 500, color: '#1A2B24' }}>{emp.phone}</div>}
                    {emp.email && <div style={{ marginTop: 2 }}>{emp.email}</div>}
                    {emp.certNumber && <div style={{ marginTop: 2 }}>证号：{emp.certNumber}</div>}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                      background: emp.staffStatus === 'active' ? '#E8F5EF' : '#FEF2F2',
                      color: emp.staffStatus === 'active' ? '#1E6B50' : '#DC2626',
                    }}>
                      {emp.staffStatus === 'active' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    {isSuperAdmin && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(emp)} style={{ marginRight: 4 }}>编辑</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(emp)} style={{ marginRight: 4 }}>
                          {emp.staffStatus === 'active' ? '停用' : '启用'}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => openResetPwd(emp)} style={{ marginRight: 4 }}>重置密码</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(emp)}>删除</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 新增/编辑 Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑员工' : '新建员工'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <form onSubmit={handleSave} className="modal-body" autoComplete="off">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">姓名 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} required autoComplete="off" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">手机号码 *（用于登录医护端）</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={set('phone')}
                    placeholder="11位手机号" maxLength={11} autoComplete="off" />
                </div>
                {!editId && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">用户名（可选，系统内部标识）</label>
                    <input className="form-input" value={form.username} onChange={set('username')} placeholder="不填则自动生成" autoComplete="off" />
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">{editId ? '密码（留空则不修改）' : '密码 *'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={set('password')} placeholder="至少6位" autoComplete="new-password" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">系统角色 *</label>
                  <select className="form-input" value={form.role} onChange={set('role')}>
                    {Object.entries(SYSTEM_ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">自定义角色</label>
                  <select className="form-input" value={form.customRoleId} onChange={set('customRoleId')}>
                    <option value="">无</option>
                    {roles.map(r => <option key={r._id} value={r._id}>{r.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">部门</label>
                  <select className="form-input" value={form.deptId} onChange={set('deptId')}>
                    <option value="">无</option>
                    {depts.filter(d => d.status === 'active').map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">职称</label>
                  <input className="form-input" value={form.title} onChange={set('title')} placeholder="如：主任医师" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">邮箱</label>
                  <input className="form-input" type="email" value={form.email} onChange={set('email')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">证书编号</label>
                  <input className="form-input" value={form.certNumber} onChange={set('certNumber')} placeholder="如医师执业证号" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">所属团队</label>
                  <select className="form-input" value={form.teamId} onChange={set('teamId')}>
                    <option value="">不属于任何团队</option>
                    {teams.map(t => <option key={t._id} value={t._id}>{t.name}{t.mentorId?.name ? `（负责人：${t.mentorId.name}）` : ''}</option>)}
                  </select>
                </div>
                {editId && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">担任团队负责人（可查看该团队全部成员的健康档案）</label>
                    <select className="form-input" value={form.mentorOfTeamId} onChange={set('mentorOfTeamId')}>
                      <option value="">不担任负责人</option>
                      {teams.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                    </select>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>设为某团队负责人后，此员工即可查看该团队所有成员名下的客户档案</div>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
                <PersonalPerformanceRuleForm rule={form.personalPerformanceRule} onChange={v => setForm(f => ({ ...f, personalPerformanceRule: v }))} />
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

      {/* 重置密码 Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowResetModal(false) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h3 className="modal-title">重置密码</h3>
              <button className="modal-close" onClick={() => setShowResetModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">新密码（至少6位）</label>
                <input className="form-input" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowResetModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleResetPwd}>确认重置</button>
            </div>
          </div>
        </div>
      )}

      {showTeamMgr && (
        <TeamManagerModal
          teams={teams}
          staffList={list}
          onClose={() => setShowTeamMgr(false)}
          onChanged={() => { loadTeams(); loadAll() }}
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
                {staffList.map(s => <option key={s._id} value={s._id}>{s.name}（{SYSTEM_ROLE_LABEL[s.role] || s.role}）</option>)}
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
