import AiWorkbenchProvider from './AiWorkbenchProvider'
import WorkbenchReminder, { useWorkbenchReminder } from './WorkbenchReminder'
import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useStaff } from '../App'
import { NotificationSummaryProvider, useNotificationSummary } from './NotificationSummary'
import AppIcon from './AppIcon'
import { getSetupNav } from '../setupNav'
import { hasModulePermission } from '../modulePermission'

// moduleKey: 对应 StaffRole 里的权限模块 key，无 key 表示所有人可见
// roles: 无 customRoleId 时按内置角色过滤（空数组=全部可见）
const ALL_NAV = [
  { label: '工作台',       icon: 'home', path: '/home',             roles: [] },
  { label: '家庭服务助手', icon: 'services', path: '/service-assistant', roles: [], moduleKey: 'service_assistant' },
  { label: '我的会员',     icon: 'patients', path: '/patients',     roles: [],                                                                                  moduleKey: 'patients' },
  { label: '随访管理',     icon: 'followups', path: '/followups',   roles: [],                                                                                  moduleKey: 'followups' },
  { label: '服务方案',     icon: 'plans', path: '/plans',           roles: ['familyDoctor','nutritionist','rehabSpecialist','tcmDoctor','superadmin'],           moduleKey: 'plans' },
  { label: '就医资源',     icon: 'knowledge', path: '/medical-resource-knowledge', roles: [], moduleKey: 'medical_resources' },
  { label: '专病管理库',   icon: 'knowledge', path: '/specialty-library', roles: [] },
  { label: '报告管理',     icon: 'reports', path: '/reports',       roles: ['healthManager','familyDoctor','superadmin'],                                        moduleKey: 'reports' },
  { label: '服务记录',     icon: 'services', path: '/service-records', roles: [],                                                                                moduleKey: 'service_records' },
  { label: '科普推送',     icon: 'knowledge', path: '/knowledge',   roles: ['healthManager','nutritionist','familyDoctor','superadmin'],                         moduleKey: 'knowledge' },
  { label: '问卷推送',     icon: 'questionnaires', path: '/questionnaires', roles: ['healthManager','familyDoctor','superadmin'],                                      moduleKey: 'questionnaires' },
  { label: '产品推送',     icon: 'products', path: '/products',     roles: [],                                                                                  moduleKey: 'products' },
  { label: '物资与设备',   icon: 'products', path: '/inventory',    roles: [] },
  { label: '分佣中心',     icon: 'commission', path: '/commission', roles: [],                                                                                  moduleKey: 'commission' },
  { label: '会员营销',     icon: 'marketing', path: '/marketing',   roles: ['superadmin','manager','healthManager','familyDoctor'],                              moduleKey: 'marketing' },
  { label: '官网线索',     icon: 'marketing', path: '/visitor-leads', roles: ['superadmin','healthPlanner'],                                                     moduleKey: 'leads' },
  { label: '团队管理',     icon: 'team', path: '/team',             roles: ['superadmin','familyDoctor','nutritionist','medicalAssistant','healthManager'],      moduleKey: 'team' },
  { label: '排班与预约',   icon: 'team', path: '/availability',     roles: [] },
  { label: '专家咨询',     icon: 'services', path: '/expert-consultations', roles: ['healthManager','familyDoctor','healthPlanner','specialist','nutritionist','rehabSpecialist','psychologist','tcmDoctor','superadmin'] },
  { label: '运营看板',     icon: 'operations', path: '/operations', roles: ['superadmin','manager'],                                                            moduleKey: 'operations' },
  { label: '日常健康数据', icon: 'checkin', path: '/daily-checkin', roles: [], moduleKey: 'daily_checkin' },
  { label: '消息通知',     icon: 'notifications', path: '/notifications', roles: [] },
  { label: '分派给我的反馈', icon: 'notifications', path: '/feedback', roles: [] },
  { label: '个人中心',     icon: 'profile', path: '/profile',       roles: [] },
]

const PRIMARY_NAV_PATHS = ['/home', '/service-assistant', '/patients', '/notifications', '/profile']
const NAV_GROUPS = [
  { id: 'care', label: '会员服务', paths: ['/followups', '/plans', '/reports', '/service-records', '/expert-consultations', '/daily-checkin'] },
  { id: 'resources', label: '资源与推送', paths: ['/medical-resource-knowledge', '/specialty-library', '/knowledge', '/questionnaires', '/products', '/inventory'] },
  { id: 'operations', label: '运营协作', paths: ['/feedback', '/commission', '/marketing', '/visitor-leads', '/team', '/availability', '/operations'] },
]

const isCurrentPath = (currentPath, path) => currentPath === path || currentPath.startsWith(path + '/')

export default function Layout() {
  const { staff } = useStaff()
  return <NotificationSummaryProvider key={`${staff?._id || staff?.id || staff?.username}:${staff?.role}`} disabled={staff?.tenantStatus === 'setup'}><AiWorkbenchProvider disabled={staff?.tenantStatus === 'setup'}><WorkbenchReminder disabled={staff?.tenantStatus === 'setup'}><LayoutContent /></WorkbenchReminder></AiWorkbenchProvider></NotificationSummaryProvider>
}

function LayoutContent() {
  const { staff, logout } = useStaff()
  const nav = useNavigate()
  const loc = useLocation()
  const setup = staff?.tenantStatus === 'setup'
  const setupView = setup ? new URLSearchParams(loc.search).get('view') || '/home' : loc.pathname
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { count: notifBadge } = useNotificationSummary()
  const workbench = useWorkbenchReminder()
  const visibleNav = setup ? getSetupNav(staff) : ALL_NAV.filter(item => {
    if (!item.moduleKey) return item.roles.length === 0 || item.roles.includes(staff?.role)
    if (staff?.customPermissions) return hasModulePermission(staff, item.moduleKey, 'view')
    return item.roles.length === 0 || item.roles.includes(staff?.role)
  })
  const primaryNav = visibleNav.filter(item => PRIMARY_NAV_PATHS.includes(item.path))
  const groupedNav = NAV_GROUPS.map(group => ({
    ...group,
    items: group.paths.map(path => visibleNav.find(item => item.path === path)).filter(Boolean),
  })).filter(group => group.items.length > 0)
  const knownPaths = new Set([...PRIMARY_NAV_PATHS, ...NAV_GROUPS.flatMap(group => group.paths)])
  const otherNav = visibleNav.filter(item => !knownPaths.has(item.path))
  if (otherNav.length) groupedNav.push({ id: 'other', label: '其他功能', items: otherNav })
  const activeGroup = groupedNav.find(group => group.items.some(item => isCurrentPath(setupView, item.path)))?.id || null
  const [openGroup, setOpenGroup] = useState(activeGroup)

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup)
  }, [activeGroup])

  const handleLogout = () => {
    if (window.confirm('确定要退出登录吗？')) {
      logout()
      nav('/login')
    }
  }

  const handleNavClick = (path) => {
    nav(setup ? `/setup?view=${encodeURIComponent(path)}` : path === '/home' ? '/home?todo=all' : path)
    setSidebarOpen(false)
  }

  const initials = staff?.name?.slice(0, 1) || 'S'

  const renderNavItem = (item) => {
    const isActive = isCurrentPath(setupView, item.path)
    return (
      <button
        type="button"
        key={item.path}
        className={`sidebar-item ${isActive ? 'active' : ''}`}
        aria-current={isActive ? 'page' : undefined}
        onClick={() => handleNavClick(item.path)}
      >
        <span className="sidebar-item-icon"><AppIcon name={item.icon} /></span>
        <span className="sidebar-item-label">{item.label}</span>
        {item.path === '/home' && (workbench.pending || workbench.error) && <span className={`sidebar-workbench-dot${workbench.pending ? '' : ' is-unknown'}`} role="status" aria-label={workbench.pending ? '有待处理任务' : '待办更新失败，请进入工作台重试'} title={workbench.error ? '待办更新失败，保留上次提醒；请进入工作台重试' : '有待处理任务；完成或转交后更新'} />}
        {item.path === '/notifications'  && notifBadge > 0 && (
          <span className="sidebar-notification-badge">{notifBadge}</span>
        )}
      </button>
    )
  }

  // Chat sidebar pages use their full width instead of nesting the staff navigation.
  if (loc.pathname === '/service-assistant' && new URLSearchParams(loc.search).get('embedded') === '1') {
    return <main><Outlet /></main>
  }

  return (
    <div className="app-layout">
      {/* 移动端顶部栏 */}
      <header className="mobile-header">
        <button aria-label={workbench.pending ? "打开菜单，有待处理任务" : "打开菜单"} className="mobile-menu-btn" onClick={() => setSidebarOpen(true)}>
          <span /><span /><span />
          {(workbench.pending || workbench.error) && <i className={`sidebar-workbench-dot${workbench.pending ? '' : ' is-unknown'}`} aria-hidden="true" />}
        </button>
        <div className="mobile-header-title">{staff?.tenantName || '机构医护端'}</div>
        <div className="mobile-header-avatar">{initials}</div>
      </header>

      {/* 遮罩层 */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-title">{staff?.tenantName || '机构医护端'}</div>
          <div className="sidebar-logo-sub">{staff?.tenantSlogan || '医护工作台'}</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">常用入口</div>
          {primaryNav.map(renderNavItem)}
          <div className="sidebar-section-label sidebar-section-label-groups">全部功能</div>
          {groupedNav.map(group => (
            <div className="sidebar-group" key={group.id}>
              <button
                type="button"
                className={`sidebar-group-toggle ${openGroup === group.id ? 'expanded' : ''} ${activeGroup === group.id ? 'contains-active' : ''}`}
                aria-expanded={openGroup === group.id}
                aria-controls={`sidebar-group-${group.id}`}
                onClick={() => setOpenGroup(openGroup === group.id ? null : group.id)}
              >
                <span>{group.label}</span>
                <span className="sidebar-group-count">{group.items.length}</span>
                <span className="sidebar-group-chevron" aria-hidden="true">⌄</span>
              </button>
              <div id={`sidebar-group-${group.id}`} className="sidebar-group-items" hidden={openGroup !== group.id}>
                {group.items.map(renderNavItem)}
              </div>
            </div>
          ))}
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
