import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAdmin } from '../App'

const NAV_SECTIONS = [
  {
    label: '功能菜单',
    items: [
      { label: '数据总览',     icon: '📊', path: '/dashboard' },
      { label: '会员管理',     icon: '👥', path: '/patients' },
      { label: '订单管理',     icon: '📋', path: '/orders' },
      { label: '消息中心',     icon: '💬', path: '/messages' },
      { label: '商城产品管理', icon: '🏪', path: '/products' },
      { label: '合作伙伴权益', icon: '🤝', path: '/partners' },
      { label: '企业客户管理', icon: '🏢', path: '/enterprises' },
      { label: '365会员管理',  icon: '🎫', path: '/member365' },
      { label: '健康方案模板', icon: '📚', path: '/health-plan-templates' },
      { label: '问卷管理',     icon: '📝', path: '/questionnaires' },
      { label: '信息变更记录', icon: '📌', path: '/change-logs' },
    ],
  },
  {
    label: '基本设置',
    items: [
      { label: '企业信息',   icon: '🏢', path: '/settings/company' },
      { label: '部门管理',   icon: '🏬', path: '/settings/departments' },
      { label: '角色管理',   icon: '🔐', path: '/settings/roles' },
      { label: '员工管理',   icon: '👨‍⚕️', path: '/settings/employees' },
      { label: '会员设置',     icon: '🪪', path: '/settings/members' },
      { label: '健康评分配置', icon: '📈', path: '/settings/scoring' },
    ],
  },
  {
    label: '项目设置',
    items: [
      { label: '分类管理',     icon: '🗂️', path: '/projects/categories' },
      { label: '疾病名称库',   icon: '🩺', path: '/projects/diseases' },
      { label: '检验项目',     icon: '🧪', path: '/projects/lab-test-items' },
      { label: '检验医嘱',     icon: '📄', path: '/projects/lab-test-orders' },
      { label: '专项筛查项目', icon: '📦', path: '/projects/lab-test-packages' },
      { label: '检查医嘱',     icon: '🔬', path: '/projects/special-exams' },
      { label: '功能医学检测', icon: '🧬', path: '/projects/functional-medicine' },
      { label: '服务项目',     icon: '🤝', path: '/projects/service-items' },
      { label: '其他收费',     icon: '💰', path: '/projects/other-charges' },
      { label: '项目模板',     icon: '📋', path: '/projects/templates' },
      { label: '随访表单',     icon: '📃', path: '/projects/followup-forms' },
      { label: '随访方案',     icon: '🗓️', path: '/projects/followup-plans' },
    ],
  },
]

const ROLE_MAP = { doctor: '医生', manager: '健管师', superadmin: '超级管理员' }

export default function Layout() {
  const { admin, logout } = useAdmin()
  const nav = useNavigate()
  const loc = useLocation()
  const [collapsed, setCollapsed] = useState({})

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  const toggleSection = (label) => {
    setCollapsed(prev => ({ ...prev, [label]: !prev[label] }))
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
          {NAV_SECTIONS.map(section => (
            <div key={section.label}>
              <div
                className="sidebar-section-label"
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                onClick={() => toggleSection(section.label)}
              >
                <span>{section.label}</span>
                <span style={{ fontSize: 10, opacity: 0.6, marginRight: 4 }}>
                  {collapsed[section.label] ? '▶' : '▼'}
                </span>
              </div>
              {!collapsed[section.label] && section.items.map(item => {
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
            </div>
          ))}
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
