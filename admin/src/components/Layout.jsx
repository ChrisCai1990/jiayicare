import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAdmin } from '../App'
import { adminAPI } from '../api'

const NAV_SECTIONS = [
  {
    label: '业务管理',
    items: [
      { label: '数据总览', icon: 'dashboard', path: '/dashboard' },
      { label: '会员管理', icon: 'users', path: '/patients' },
      { label: '订单管理', icon: 'orders', path: '/orders' },
      { label: '佣金审核', icon: 'money', path: '/commissions' },
      { label: '消息中心', icon: 'message', path: '/messages' },
      { label: '用户反馈', icon: 'feedback', path: '/feedback', badgeKey: 'feedback' },
    ],
  },
  {
    label: '运营管理',
    items: [
      { label: '商城产品', icon: 'product', path: '/products' },
      { label: '合作伙伴权益', icon: 'partner', path: '/partners' },
      { label: '企业客户', icon: 'company', path: '/enterprises' },
      { label: '健康基金', icon: 'fund', path: '/health-fund' },
      { label: '运营看板', icon: 'chart', path: '/ops-dashboard' },
      { label: '健康方案模板', icon: 'template', path: '/health-plan-templates' },
      { label: '问卷管理', icon: 'form', path: '/questionnaires' },
      { label: '信息变更记录', icon: 'history', path: '/change-logs' },
    ],
  },
  {
    label: '基础设置',
    items: [
      { label: '企业信息', icon: 'company', path: '/settings/company' },
      { label: '部门管理', icon: 'department', path: '/settings/departments' },
      { label: '角色管理', icon: 'role', path: '/settings/roles' },
      { label: '员工管理', icon: 'staff', path: '/settings/employees' },
      { label: '会员设置', icon: 'member', path: '/settings/members' },
      { label: '健康评分配置', icon: 'score', path: '/settings/scoring' },
      { label: 'AI 每日关怀', icon: 'care', path: '/settings/daily-care' },
    ],
  },
  {
    label: '项目设置',
    items: [
      { label: '分类管理', icon: 'category', path: '/projects/categories' },
      { label: '疾病名称库', icon: 'disease', path: '/projects/diseases' },
      { label: '检验项目', icon: 'lab', path: '/projects/lab-test-items' },
      { label: '检验医嘱', icon: 'order', path: '/projects/lab-test-orders' },
      { label: '专项筛查项目', icon: 'screen', path: '/projects/lab-test-packages' },
      { label: '检查医嘱', icon: 'exam', path: '/projects/special-exams' },
      { label: '功能医学检测', icon: 'medical', path: '/projects/functional-medicine' },
      { label: '服务项目', icon: 'service', path: '/projects/service-items' },
      { label: '其他收费', icon: 'money', path: '/projects/other-charges' },
      { label: '项目模板', icon: 'template', path: '/projects/templates' },
      { label: '随访表单', icon: 'form', path: '/projects/followup-forms' },
      { label: '随访方案', icon: 'plan', path: '/projects/followup-plans' },
    ],
  },
  {
    label: '平台运营',
    platformOnly: true,
    items: [{ label: '机构管理', icon: 'tenant', path: '/tenants' }],
  },
]

const ROLE_MAP = { doctor: '医生', manager: '健康管理师', superadmin: '超级管理员', platformSuper: '平台超管' }

const ICON_PATHS = {
  dashboard: 'M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  orders: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  money: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  message: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  default: 'M4 4h16v16H4zM8 9h8M8 13h8',
}

function NavIcon({ name }) {
  const path = ICON_PATHS[name] || ICON_PATHS.default
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

function isItemActive(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export default function Layout() {
  const { admin, logout } = useAdmin()
  const nav = useNavigate()
  const loc = useLocation()
  const visibleSections = useMemo(
    () => NAV_SECTIONS.filter(section => !section.platformOnly || admin?.role === 'platformSuper'),
    [admin?.role],
  )
  const activeSection = visibleSections.find(section => section.items.some(item => isItemActive(loc.pathname, item.path)))?.label
  const activeItem = visibleSections.flatMap(section => section.items).find(item => isItemActive(loc.pathname, item.path))
  const [expanded, setExpanded] = useState(() => activeSection ? { [activeSection]: true } : { 业务管理: true })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [pendingFeedback, setPendingFeedback] = useState(0)

  useEffect(() => {
    if (activeSection) setExpanded(prev => ({ ...prev, [activeSection]: true }))
    setMobileOpen(false)
  }, [activeSection, loc.pathname])

  useEffect(() => {
    let cancelled = false
    const loadPending = async () => {
      try {
        const res = await adminAPI.feedbackList({ status: 'pending' })
        if (!cancelled) setPendingFeedback((res.data || []).length)
      } catch { /* 徽标加载失败不影响导航 */ }
    }
    loadPending()
    const timer = setInterval(loadPending, 30000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  return (
    <div className="app-layout">
      {mobileOpen && <button className="sidebar-scrim" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} />}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark"><span>嘉</span></div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-title">嘉医管家</div>
            <div className="sidebar-logo-sub">运营管理中心</div>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="主导航">
          {visibleSections.map(section => {
            const isExpanded = !!expanded[section.label]
            const containsActive = section.label === activeSection
            return (
              <section className={`sidebar-section ${containsActive ? 'contains-active' : ''}`} key={section.label}>
                <button
                  className="sidebar-section-label"
                  aria-expanded={isExpanded}
                  onClick={() => setExpanded(prev => ({ ...prev, [section.label]: !prev[section.label] }))}
                >
                  <span>{section.label}</span>
                  <svg className="sidebar-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
                </button>
                {isExpanded && (
                  <div className="sidebar-section-items">
                    {section.items.map(item => {
                      const active = isItemActive(loc.pathname, item.path)
                      return (
                        <button
                          key={item.path}
                          className={`sidebar-item ${active ? 'active' : ''}`}
                          aria-current={active ? 'page' : undefined}
                          onClick={() => nav(item.path)}
                        >
                          <span className="sidebar-item-icon"><NavIcon name={item.icon} /></span>
                          <span className="sidebar-item-label">{item.label}</span>
                          {item.badgeKey === 'feedback' && pendingFeedback > 0 && (
                            <span className="sidebar-badge">{pendingFeedback > 99 ? '99+' : pendingFeedback}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-admin-info">
            <div className="sidebar-admin-avatar">{admin?.name?.slice(0, 1) || '管'}</div>
            <div className="sidebar-admin-copy">
              <div className="sidebar-admin-name">{admin?.name || '管理员'}</div>
              <div className="sidebar-admin-role">{ROLE_MAP[admin?.role] || admin?.role || '管理员'}</div>
            </div>
            <button className="sidebar-logout" title="退出登录" aria-label="退出登录" onClick={handleLogout}>
              <svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="content-shell">
        <header className="topbar">
          <button className="mobile-menu-button" aria-label="打开菜单" onClick={() => setMobileOpen(true)}>
            <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <div className="topbar-location">
            <span>管理后台</span><span className="topbar-separator">/</span><strong>{activeItem?.label || '工作台'}</strong>
          </div>
          <div className="topbar-user">{admin?.title || ROLE_MAP[admin?.role] || '管理员'}</div>
        </header>
        <main className="main-content"><Outlet /></main>
      </div>
    </div>
  )
}
