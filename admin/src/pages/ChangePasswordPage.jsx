import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useAdmin } from '../App'

export default function ChangePasswordPage() {
  const { admin, login, logout } = useAdmin()
  const navigate = useNavigate()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setError('')
    if (newPassword.length < 10 || newPassword.length > 128) return setError('新密码须为10至128位')
    if (newPassword !== confirmation) return setError('两次输入的新密码不一致')
    setBusy(true)
    try {
      await adminAPI.changePassword(oldPassword, newPassword)
      login({ ...admin, mustChangePassword: false })
      navigate(admin.role === 'platformSuper' ? '/tenants' : '/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || '修改失败')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page" style={{ maxWidth: 480, margin: '40px auto' }}>
    <h1 className="page-title">修改初始密码</h1>
    <p>首次使用机构管理员账号前，请设置只有你本人掌握的新密码。</p>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    <form onSubmit={submit}>
      <div className="form-group"><label className="form-label">当前密码</label><input className="form-input" type="password" autoComplete="current-password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} required /></div>
      <div className="form-group"><label className="form-label">新密码</label><input className="form-input" type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} minLength={10} maxLength={128} required /></div>
      <div className="form-group"><label className="form-label">再次输入新密码</label><input className="form-input" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></div>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '保存中…' : '保存新密码'}</button>
      <button className="btn btn-secondary" type="button" onClick={logout} style={{ marginLeft: 8 }}>退出登录</button>
    </form>
  </div>
}
