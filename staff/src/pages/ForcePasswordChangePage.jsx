import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useStaff } from '../App'

export default function ForcePasswordChangePage() {
  const { staff, login, logout } = useStaff()
  const navigate = useNavigate()
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirm: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.oldPassword || !form.newPassword || !form.confirm) {
      setError('请完整填写原密码、新密码和确认密码')
      return
    }
    if (form.newPassword.length < 6) {
      setError('新密码不能少于6位')
      return
    }
    if (form.newPassword === form.oldPassword) {
      setError('新密码不能与初始密码相同')
      return
    }
    if (form.newPassword !== form.confirm) {
      setError('两次输入的新密码不一致')
      return
    }
    setSaving(true)
    try {
      await staffAPI.changePassword({
        oldPassword: form.oldPassword,
        newPassword: form.newPassword,
      })
      login({ ...staff, mustChangePassword: false })
      navigate('/home', { replace: true })
    } catch (err) {
      setError(err.message || '密码修改失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  const exit = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <div className="login-logo-title">首次登录，请修改密码</div>
          <div className="login-logo-sub">
            Admin 设置的是统一初始密码。为保护会员健康信息，修改后才能进入医护工作台。
          </div>
        </div>

        {error && <div className="login-err">⚠️ {error}</div>}

        <form onSubmit={submit}>
          <div className="form-group">
            <label className="form-label">当前初始密码</label>
            <input className="form-input" type="password" autoComplete="current-password"
              value={form.oldPassword}
              onChange={e => setForm(f => ({ ...f, oldPassword: e.target.value }))}
              placeholder="输入本次登录使用的密码" />
          </div>
          <div className="form-group">
            <label className="form-label">设置新密码</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
              placeholder="至少6位，不能与初始密码相同" />
          </div>
          <div className="form-group">
            <label className="form-label">确认新密码</label>
            <input className="form-input" type="password" autoComplete="new-password"
              value={form.confirm}
              onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
              placeholder="再次输入新密码" />
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%' }}>
            {saving ? '修改中…' : '修改密码并进入工作台'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={exit} disabled={saving}
            style={{ width: '100%', marginTop: 10 }}>
            退出登录
          </button>
        </form>
      </div>
    </div>
  )
}
