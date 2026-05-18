import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI, setToken } from '../api'
import { useAdmin } from '../App'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAdmin()
  const nav = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await adminAPI.login(username.trim(), password)
      setToken(res.data.token)
      login(res.data.admin)
      nav('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏥</div>
          <div className="login-logo-title">嘉医管家</div>
          <div className="login-logo-sub">医护管理后台 · 仅限授权人员使用</div>
        </div>

        {error && <div className="login-err">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">用户名</label>
            <input
              className="form-input"
              type="text"
              placeholder="请输入用户名"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label className="form-label">密码</label>
            <input
              className="form-input"
              type="password"
              placeholder="请输入密码"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="login-hint">
          默认账号：<code>doctor1</code> / <code>manager1</code>，密码：<code>jiayi2024</code>
        </div>
      </div>
    </div>
  )
}
