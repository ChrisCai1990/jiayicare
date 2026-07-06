import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hrAPI, setHrToken } from '../../hrApi'
import { useHr } from './HrApp'

export default function HrLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useHr()
  const nav = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return }
    setLoading(true); setError('')
    try {
      const res = await hrAPI.login(username.trim(), password)
      setHrToken(res.data.token)
      login(res.data.admin)
      nav('/hr/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || '登录失败，请检查用户名和密码')
    } finally { setLoading(false) }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
          <div className="login-logo-title">企业健康管理平台</div>
          <div className="login-logo-sub">企业客户专属入口</div>
        </div>
        {error && <div className="login-err">⚠️ {error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input className="form-input" type="text" value={username}
              onChange={e => { setUsername(e.target.value); setError('') }} autoComplete="username" />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input className="form-input" type="password" value={password}
              onChange={e => { setPassword(e.target.value); setError('') }} autoComplete="current-password" />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>{loading ? '登录中...' : '登录'}</button>
        </form>
      </div>
    </div>
  )
}
