import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../App'

const NAV = [
  { label: '数据总览',     icon: '📊', path: '/dashboard' },
  { label: '患者管理',     icon: '👥', path: '/patients' },
  { label: '订单管理',     icon: '📋', path: '/orders' },
  { label: '消息中心',     icon: '💬', path: '/messages' },
  { label: '服务管理',     icon: '🛒', path: '/services' },
  { label: '商城产品管理', icon: '🏪', path: '/products' },
  { label: '健康方案模板', icon: '📚', path: '/health-plan-templates' },
  { label: '问卷管理',     icon: '📝', path: '/questionnaires' },
  { label: '信息变更记录', icon: '📌', path: '/change-logs' },
  { label: '医护账号管理', icon: '👨‍⚕️', path: '/staff' },
]

const ROLE_MAP = { doctor: '医生', manager: '健管师', superadmin: '超级管理员' }

export default function Layout() {
  const { admin, logout } = useAdmin()
  const nav = useNavigate()
  const loc = useLocation()

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  const initials = admin?.name?.slice(0, 1) || 'A'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <svg viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <circle cx="12" cy="9" r="2.5" strokeWidth="2.5" style={{fill:'none',stroke:'#fff'}}/>
            </svg>
          </div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">嘉医管家</div>
            <div className="sidebar-logo-sub">医护管理后台</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">功能菜单</div>
          {NAV.map(item => {
            const isActive = loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')
            return (
              <div
                key={item.path}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => nav(item.path)}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-admin-info">
            <div className="sidebar-admin-avatar">{initials}</div>
            <div>
              <div className="sidebar-admin-name">{admin?.name || '管理员'}</div>
              <div className="sidebar-admin-role">
                {ROLE_MAP[admin?.role] || admin?.role}{admin?.title ? ` · ${admin.title}` : ''}
              </div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>退出登录</button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
