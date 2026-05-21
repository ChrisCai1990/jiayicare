import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useStaff } from '../App'

const NAV = [
  { label: '工作台',   icon: '🏠', path: '/home' },
  { label: '我的患者', icon: '👥', path: '/patients' },
  { label: '随访记录', icon: '📋', path: '/followups' },
]

export default function Layout() {
  const { staff, logout } = useStaff()
  const nav = useNavigate()
  const loc = useLocation()

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  const initials = staff?.name?.slice(0, 1) || 'S'

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">🏥 嘉医管家</div>
          <div className="sidebar-logo-sub">医护工作台</div>
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
              <div className="sidebar-admin-name">{staff?.name || '医护人员'}</div>
              <div className="sidebar-admin-role">
                {staff?.roleLabel || staff?.role}
                {staff?.title ? ` · ${staff.title}` : ''}
              </div>
            </div>
          </div>
          <button className="sidebar-logout" onClick={handleLogout}>退出登录</button>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
