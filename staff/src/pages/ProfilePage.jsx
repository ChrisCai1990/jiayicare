import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff, useToast } from '../App'

const ROLE_LABEL = {
  familyDoctor:'家庭医生', nutritionist:'营养师', healthManager:'健管专员',
  medicalAssistant:'就医专员', psychologist:'心理咨询师', rehabSpecialist:'运动复健师',
  tcmDoctor:'中医师', specialist:'专科医师', healthPlanner:'健康规划师', superadmin:'超级管理员',
}

export default function ProfilePage() {
  const { staff, login, logout } = useStaff()
  const nav = useNavigate()
  const toast = useToast()

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: staff?.name || '', title: staff?.title || '', department: staff?.department || '' })
  const [saving, setSaving] = useState(false)
  const [pwForm, setPwForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await staffAPI.updateMe(form)
      // 更新本地 staff 信息
      const updated = { ...staff, name: form.name, title: form.title, department: form.department }
      login(updated)
      localStorage.setItem('jy_staff_info', JSON.stringify(updated))
      toast('信息已更新')
      setEditing(false)
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  const handlePwChange = async () => {
    setPwError('')
    if (!pwForm.oldPassword || !pwForm.newPassword) { setPwError('请填写原密码和新密码'); return }
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('两次密码不一致'); return }
    if (pwForm.newPassword.length < 6) { setPwError('新密码至少6位'); return }
    setPwSaving(true)
    try {
      await staffAPI.changePassword({ oldPassword: pwForm.oldPassword, newPassword: pwForm.newPassword })
      toast('密码已修改，下次登录请使用新密码')
      setPwForm({ oldPassword: '', newPassword: '', confirm: '' })
    } catch (err) { setPwError(err.message) }
    finally { setPwSaving(false) }
  }

  const initials = staff?.name?.slice(0, 1) || 'S'

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">个人中心</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 个人信息 */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">基本信息</div>
            {!editing
              ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button>
              : <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
                </div>
            }
          </div>
          <div className="card-body">
            {/* 头像 */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#1E6B50', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', fontWeight: 700 }}>
                {initials}
              </div>
            </div>

            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">姓名</label>
                  <input className="form-input" value={form.name} onChange={set('name')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">职称</label>
                  <input className="form-input" placeholder="如：主任医师" value={form.title} onChange={set('title')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">部门</label>
                  <input className="form-input" placeholder="如：医疗服务部" value={form.department} onChange={set('department')} />
                </div>
              </div>
            ) : (
              <>
                <InfoRow label="姓名" value={staff?.name} />
                <InfoRow label="角色" value={ROLE_LABEL[staff?.role] || staff?.role} highlight />
                <InfoRow label="职称" value={staff?.title || '-'} />
                <InfoRow label="部门" value={staff?.department || '-'} />
                <InfoRow label="账号ID" value={staff?._id?.slice(-8) || '-'} mono />
              </>
            )}
          </div>
        </div>

        {/* 修改密码 */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔐 修改密码</div>
          </div>
          <div className="card-body">
            {pwError && <div className="login-err" style={{ marginBottom: 12 }}>⚠️ {pwError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">原密码</label>
                <input className="form-input" type="password" value={pwForm.oldPassword}
                  onChange={e => setPwForm(f => ({ ...f, oldPassword: e.target.value }))} placeholder="输入当前密码" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">新密码</label>
                <input className="form-input" type="password" value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))} placeholder="至少6位" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">确认新密码</label>
                <input className="form-input" type="password" value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="再次输入新密码" />
              </div>
              <button className="btn btn-primary" onClick={handlePwChange} disabled={pwSaving}>
                {pwSaving ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>

        {/* 系统信息 */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-header"><div className="card-title">📱 关于系统</div></div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[
                { label: '系统名称', value: '嘉医管家 · 医护工作台' },
                { label: '当前版本', value: 'v2.0.0 (P3)' },
                { label: '技术支持', value: '嘉医汇技术团队' },
              ].map(item => (
                <div key={item.label} style={{ padding: '12px 16px', background: '#f9f7f3', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontWeight: 600, color: '#1A2B24', fontSize: 14 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 退出登录 */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24' }}>退出登录</div>
              <div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>
                当前账号：{staff?.name || '-'} · {staff?.roleLabel || staff?.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 24px', borderRadius: 8, border: '1px solid #DC3545',
                background: '#fff', color: '#DC3545', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.target.style.background = '#DC3545'; e.target.style.color = '#fff' }}
              onMouseLeave={e => { e.target.style.background = '#fff'; e.target.style.color = '#DC3545' }}
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, highlight, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
      <span style={{ color: '#8AA89C' }}>{label}</span>
      <span style={{ color: highlight ? '#1E6B50' : '#1A2B24', fontWeight: highlight ? 700 : 500, fontFamily: mono ? 'monospace' : 'inherit' }}>{value || '-'}</span>
    </div>
  )
}
