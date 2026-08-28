import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useStaff } from '../App'
import { staffAPI } from '../api'
import AppIcon from './AppIcon'

// moduleKey: 对应 StaffRole 里的权限模块 key，无 key 表示所有人可见
// roles: 无 customRoleId 时按内置角色过滤（空数组=全部可见）
const ALL_NAV = [
  { label: '工作台',       icon: 'home', path: '/home',             roles: [] },
  { label: '我的会员',     icon: 'patients', path: '/patients',     roles: [],                                                                                  moduleKey: 'patients' },
  { label: '随访管理',     icon: 'followups', path: '/followups',   roles: [],                                                                                  moduleKey: 'followups' },
  { label: '服务方案',     icon: 'plans', path: '/plans',           roles: ['familyDoctor','nutritionist','rehabSpecialist','tcmDoctor','superadmin'],           moduleKey: 'plans' },
  { label: '报告管理',     icon: 'reports', path: '/reports',       roles: ['healthManager','familyDoctor','superadmin'],                                        moduleKey: 'reports' },
  { label: '服务记录',     icon: 'services', path: '/service-records', roles: [],                                                                                moduleKey: 'service_records' },
  { label: '科普推送',     icon: 'knowledge', path: '/knowledge',   roles: ['healthManager','nutritionist','familyDoctor','superadmin'],                         moduleKey: 'knowledge' },
  { label: '问卷推送',     icon: 'questionnaires', path: '/questionnaires', roles: ['healthManager','familyDoctor','superadmin'],                                      moduleKey: 'questionnaires' },
  { label: '产品推送',     icon: 'products', path: '/products',     roles: [],                                                                                  moduleKey: 'products' },
  { label: '分佣中心',     icon: 'commission', path: '/commission', roles: [],                                                                                  moduleKey: 'commission' },
  { label: '会员营销',     icon: 'marketing', path: '/marketing',   roles: ['superadmin','manager','healthManager','familyDoctor'],                              moduleKey: 'marketing' },
  { label: '团队管理',     icon: 'team', path: '/team',             roles: ['superadmin','familyDoctor','nutritionist','medicalAssistant','healthManager'],      moduleKey: 'team' },
  { label: '运营看板',     icon: 'operations', path: '/operations', roles: ['superadmin','manager'],                                                            moduleKey: 'operations' },
  { label: '日常健康打卡', icon: 'checkin', path: '/daily-checkin', roles: [],                                                                                  moduleKey: 'daily_checkin' },
  { label: '消息通知',     icon: 'notifications', path: '/notifications', roles: [] },
  { label: '个人中心',     icon: 'profile', path: '/profile',       roles: [] },
]

export default function Layout() {
  const { staff, logout } = useStaff()
  const nav = useNavigate()
  const loc = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifBadge, setNotifBadge] = useState(0)

  useEffect(() => {
    const fetch = async () => {
      try {
        const r = await staffAPI.getNotifications()
        const s = r.data?.summary || {}
        setNotifBadge((s.pendingReferralCount || 0) + (s.unreadMessageCount || 0) + (s.unreadRepliedCount || 0))
      } catch {}
    }
    fetch()
    const timer = setInterval(fetch, 60000)
    // 消息页把消息标为已读后会派发此事件，侧边栏红点立即重新计算，避免"已读了红点还在"的错觉
    window.addEventListener('notif-refresh', fetch)
    return () => { clearInterval(timer); window.removeEventListener('notif-refresh', fetch) }
  }, [])

  // 切换页面时也刷新一次红点（离开消息页后即时反映已读状态）
  useEffect(() => {
    staffAPI.getNotifications().then(r => {
      const s = r.data?.summary || {}
      setNotifBadge((s.pendingReferralCount || 0) + (s.unreadMessageCount || 0) + (s.unreadRepliedCount || 0))
    }).catch(() => {})
  }, [loc.pathname])

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
          <div className="sidebar-logo-sub">做健康顾问行业领跑者</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">功能菜单</div>
          {ALL_NAV.filter(item => {
            // 无 moduleKey 的项（工作台/消息/个人中心）始终显示
            if (!item.moduleKey) return true
            // 有 customPermissions（管理后台为该账号配置了自定义角色权限）时，按权限决定显隐
            if (staff?.customPermissions) {
              return !!staff.customPermissions[item.moduleKey]?.view
            }
            // 否则按内置角色过滤（空数组=全部可见）
            return item.roles.length === 0 || item.roles.includes(staff?.role)
          }).map(item => {
            const isOnPlansPage = loc.pathname === item.path || loc.pathname.startsWith(item.path + '/')
            const isActive = isOnPlansPage && !item.children

            return (
              <div
                key={item.path}
                className={`sidebar-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.path)}
              >
                <span className="sidebar-item-icon"><AppIcon name={item.icon} /></span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.path === '/notifications' && notifBadge > 0 && (
                  <span style={{ background: '#DC3545', color: '#fff', borderRadius: 99, fontSize: 11, fontWeight: 700, padding: '1px 7px', minWidth: 20, textAlign: 'center' }}>
                    {notifBadge}
                  </span>
                )}
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
