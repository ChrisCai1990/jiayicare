import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useStaff } from '../App'

const PLAN_CHILDREN = [
  { label: '年度体检方案', type: 'annual_checkup' },
  { label: '年度管理方案', type: 'annual_mgmt' },
  { label: '营养干预方案', type: 'nutrition' },
  { label: '就医协助方案', type: 'medical_assist' },
]

const ALL_NAV = [
  { label: '工作台',   icon: '🏠', path: '/home', roles: [] },
  { label: '我的会员', icon: '👥', path: '/patients', roles: [] },
  { label: '随访管理', icon: '📋', path: '/followups', roles: [] },
  { label: '健康方案', icon: '📄', path: '/plans',    roles: ['familyDoctor','nutritionist','rehabSpecialist','tcmDoctor','superadmin'], children: PLAN_CHILDREN },
  { label: '报告管理', icon: '🔬', path: '/reports',  roles: ['healthManager','familyDoctor','superadmin'] },
  { label: '异常复查', icon: '⚠️', path: '/abnormal-reviews', roles: ['healthManager','familyDoctor','superadmin'] },
  { label: '服务记录', icon: '🏥', path: '/service-records', roles: [] },
  { label: '科普推送', icon: '📢', path: '/knowledge', roles: ['healthManager','nutritionist','familyDoctor','superadmin'] },
  { label: '问卷推送', icon: '📝', path: '/questionnaires', roles: ['healthManager','familyDoctor','superadmin'] },
  { label: '产品推送', icon: '🛍', path: '/products',  roles: [] },
  { label: '分佣中心', icon: '💰', path: '/commission', roles: [] },
  { label: '会员营销', icon: '🎯', path: '/marketing',  roles: ['superadmin','manager','healthManager','familyDoctor'] },
  { label: '团队管理', icon: '🫂', path: '/team',      roles: ['superadmin','familyDoctor','nutritionist','medicalAssistant','healthManager'] },
  { label: '运营看板', icon: '📊', path: '/operations', roles: ['superadmin','manager'] },
  { label: '消息通知', icon: '🔔', path: '/notifications', roles: [] },
  { label: '个人中心', icon: '👤', path: '/profile',   roles: [] },
]

export default function Layout() {
  const { staff, logout } = useStaff()
  const nav = useNavigate()
  const loc = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(true)

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  const handleNavClick = (path) => {
    nav(path)
    setSidebarOpen(false)
  }

  const initials = staff?.name?.slice(0, 1) || 'S'

  // 获取当前 URL 的 type 参数
  const currentType = new URLSearchParams(loc.search).get('type') || ''

  return (
    <div className="app-layout">
      {/* 移动端顶部栏 */}
      <header className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
          <span /><span /><span />
        </button>
        <div className="mobile-header-title">嘉医汇</div>
        <div className="mobile-header-avatar">{initials}</div>
      </header>

      {/* 遮罩层 */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">嘉医汇</div>
          <div className="sidebar-logo-sub">做家庭医生行业领跑者</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">功能菜单</div>
          {ALL_NAV.filter(item =>
            item.roles.length === 0 || item.roles.includes(staff?.role)
          ).map(item => {
            const isOnPlansPage = loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')
            const isActive = isOnPlansPage && !item.children

            if (item.children) {
              // 有子菜单的项（健康方案）
              const isGroupActive = isOnPlansPage
              return (
                <div key={item.path}>
                  <div
                    className={`sidebar-item ${isGroupActive ? 'active' : ''}`}
                    onClick={() => setPlanExpanded(v => !v)}
                    style={{ justifyContent: 'space-between' }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="sidebar-item-icon">{item.icon}</span>
                      <span>{item.label}</span>
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.6, transition: 'transform 0.2s', display: 'inline-block', transform: planExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                  </div>
                  {planExpanded && (
                    <div style={{ paddingLeft: 16 }}>
                      {item.children.map(child => {
                        const childActive = isOnPlansPage && currentType === child.type
                        return (
                          <div
                            key={child.type}
                            className={`sidebar-item ${childActive ? 'active' : ''}`}
                            style={{ fontSize: 13, padding: '7px 12px' }}
                            onClick={() => handleNavClick(`${item.path}?type=${child.type}`)}
                          >
                            <span style={{ marginLeft: 4 }}>{child.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={item.path}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path)}
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
