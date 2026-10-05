import React, { useState, createContext, useContext, Component } from 'react'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, color: '#DC3545', fontFamily: 'monospace', fontSize: 13 }}>
        <b>页面错误：</b> {this.state.error.message}
        <pre style={{ marginTop: 8, fontSize: 11, color: '#666', whiteSpace: 'pre-wrap' }}>{this.state.error.stack?.split('\n').slice(0,5).join('\n')}</pre>
        <button onClick={() => window.location.reload()} style={{ marginTop: 12, padding: '6px 12px', cursor: 'pointer' }}>刷新页面</button>
      </div>
    )
    return this.props.children
  }
}
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { getToken, setToken, clearToken, staffAPI } from './api'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import NewPatientPage from './pages/NewPatientPage'
import FollowUpsPage from './pages/FollowUpsPage'
import PlansPage from './pages/PlansPage'
import PlanDetailPage from './pages/PlanDetailPage'
import ReportsPage from './pages/ReportsPage'
import ServiceRecordsPage from './pages/ServiceRecordsPage'
import KnowledgePage from './pages/KnowledgePage'
import QuestionnairePushPage from './pages/QuestionnairePushPage'
import CommissionPage from './pages/CommissionPage'
import OperationsPage from './pages/OperationsPage'
import ProductPushPage from './pages/ProductPushPage'
import TeamPage from './pages/TeamPage'
import ProfilePage from './pages/ProfilePage'
import NotificationsPage from './pages/NotificationsPage'
import MarketingPage from './pages/MarketingPage'
import VisitorLeadsPage from './pages/VisitorLeadsPage'
import AnnualPlanPage from './pages/AnnualPlanPage'
import AnnualMgmtPlanPage from './pages/AnnualMgmtPlanPage'
import MonthlyServiceReviewPage from './pages/MonthlyServiceReviewPage'
import PlanModulesPage from './pages/PlanModulesPage'
import DailyCheckinPage from './pages/DailyCheckinPage'
import MetabolicPilotPage from './pages/MetabolicPilotPage'
import ForcePasswordChangePage from './pages/ForcePasswordChangePage'
import ServiceAssistantPage from './pages/ServiceAssistantPage'
import ContentReviewsPage from './pages/ContentReviewsPage'
import ContentReviewHistoryPage from './pages/ContentReviewHistoryPage'
import MedicalResourceKnowledgePage from './pages/MedicalResourceKnowledgePage'
import { getSetupNav } from './setupNav'

// ── Auth Context ──────────────────────────────────────────────────
const AuthCtx = createContext(null)
export function useStaff() { return useContext(AuthCtx) }

// 路由 path → 权限模块 key。与 Layout.jsx 的 ALL_NAV.moduleKey 保持一致。
// 未列出的路由（工作台/消息/个人中心/会员详情等）不做模块级权限拦截。
export const ROUTE_MODULE = {
  '/service-assistant': 'service_assistant',
  '/patients': 'patients',
  '/followups': 'followups',
  '/plans': 'plans',
  '/medical-resource-knowledge': 'medical_resources',
  '/reports': 'reports',
  '/service-records': 'service_records',
  '/knowledge': 'knowledge',
  '/questionnaires': 'questionnaires',
  '/products': 'products',
  '/commission': 'commission',
  '/marketing': 'marketing',
  '/visitor-leads': 'leads',
  '/team': 'team',
  '/operations': 'operations',
  '/daily-checkin': 'daily_checkin',
  '/metabolic-pilot': 'daily_checkin',
}

// 判断某员工是否有权访问某模块（view 权限）。
// - 未配置自定义角色权限（customPermissions 为 null）→ 走内置角色，一律放行（老员工兼容，与 Layout 一致）
// - 配了自定义角色权限 → 严格按 customPermissions[moduleKey].view
export function canViewModule(staff, moduleKey) {
  return can(staff, moduleKey, 'view')
}

// 通用按钮级权限判断：staff 是否有某模块的某操作(view/create/edit/delete/send/audit)权限。
// 未配置自定义角色权限的老员工一律放行（与菜单/路由守卫策略一致）。
export function can(staff, moduleKey, action) {
  if (!moduleKey) return true
  if (!staff?.customPermissions) return true
  return !!staff.customPermissions[moduleKey]?.[action]
}

// hook 形式，页面里用：const can = usePermission(); ... can('patients','create')
export function usePermission() {
  const { staff } = useStaff()
  return (moduleKey, action) => can(staff, moduleKey, action)
}

function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jy_staff_info')) } catch { return null }
  })
  const login = (staffInfo, token) => {
    // 切换账号时先原子更新 token，再替换人员缓存。否则应用启动时针对旧 token
    // 发出的 /staff/me 可能晚于新账号登录返回，并把新账号角色覆盖成旧账号角色。
    if (token) setToken(token)
    setStaff(staffInfo)
    localStorage.setItem('jy_staff_info', JSON.stringify(staffInfo))
  }
  const logout = () => { setStaff(null); clearToken() }

  // 员工登录后 staff 信息(含 customPermissions)只在登录那一刻写入 localStorage，此后不再刷新——
  // 2026-07-07 排查确认：超管在角色管理里事后给该员工分配/修改自定义角色权限，员工浏览器缓存的
  // 旧 staff 对象里 customPermissions 仍是登录时的旧值(通常是null)，导致侧边栏按固定角色显示全部菜单，
  // 必须手动退出重新登录才生效。这里应用挂载时主动拉一次最新 /staff/me 覆盖缓存，不依赖重新登录。
  React.useEffect(() => {
    const tokenAtRequest = getToken()
    if (!tokenAtRequest) return
    staffAPI.me().then(r => {
      // 请求期间若已切换账号，丢弃旧账号响应，避免污染新账号的姓名、角色与权限。
      if (r.data && getToken() === tokenAtRequest) {
        setStaff(r.data)
        localStorage.setItem('jy_staff_info', JSON.stringify(r.data))
      }
    }).catch(() => {})
  }, [])

  return <AuthCtx.Provider value={{ staff, login, logout }}>{children}</AuthCtx.Provider>
}

// ── Toast Context ─────────────────────────────────────────────────
const ToastCtx = createContext(null)
export function useToast() { return useContext(ToastCtx) }

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = (msg, durationOrType = 2500) => {
    const type = typeof durationOrType === 'string' ? durationOrType : 'info'
    const duration = typeof durationOrType === 'number' ? durationOrType : type === 'error' ? 5000 : 2500
    const id = Date.now() + Math.random()
    setToast({ id, msg, type })
    setTimeout(() => setToast(current => current?.id === id ? null : current), duration)
  }
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.type === 'error' ? 'toast-error' : ''}`} role={toast.type === 'error' ? 'alert' : 'status'}>{toast.msg}</div>}
    </ToastCtx.Provider>
  )
}

// ── Guard ─────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { staff } = useStaff()
  const location = useLocation()
  const token = getToken()
  if (!staff || !token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (staff.tenantStatus === 'setup' && !['/setup', '/change-password'].includes(location.pathname)) return <Navigate to={`/setup?view=${encodeURIComponent(location.pathname)}`} replace />
  return children
}

function StaffSetupPage() {
  const { staff } = useStaff()
  const location = useLocation()
  const view = new URLSearchParams(location.search).get('view') || '/home'
  const allowed = getSetupNav(staff)
  const selected = allowed.find(item => item.path === view)
  const roleName = staff?.customRoleName || staff?.roleLabel || '机构员工'
  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })
  const emptyText = view === '/notifications' ? '暂无本机构消息。' : view === '/knowledge' ? '该工作模块将在机构业务启用后展示内容。' : '暂无本机构客户及相关记录。'
  if (view !== '/home' && !selected) return <Navigate to="/setup?view=%2Fhome" replace />
  return <div className="page">
    <div className="page-header"><div><h1 className="page-title">{view === '/home' ? `你好，${staff?.name} · ${roleName}` : selected?.label || '机构工作台'}</h1><p className="page-subtitle">{staff?.tenantName} · {today}</p></div></div>
    <div className="card" style={{ padding: 18, marginBottom: 20, background: '#F0F8F4', border: '1px solid #D4E9DC', color: '#24543D' }}>本机构工作台已建立。客户档案接入后，属于本岗位的工作会显示在这里。</div>
    {view === '/home' ? <>
      <div className="stats-grid home-stats" style={{ marginBottom: 20 }}>{[['在管客户', '0'], ['今日待办', '0'], ['待处理消息', '0']].map(([label, value]) => <div className="card" key={label} style={{ padding: 20 }}><div style={{ color: '#667085', fontSize: 13 }}>{label}</div><strong style={{ display: 'block', fontSize: 30, marginTop: 8, color: '#1E6B50' }}>{value}</strong></div>)}</div>
      <div className="card" style={{ padding: 24, marginBottom: 20 }}><h2 style={{ margin: '0 0 12px', fontSize: 18 }}>我的岗位与工作入口</h2><p style={{ color: '#667085' }}>当前岗位：{roleName}</p><div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{allowed.filter(item => item.moduleKey).map(item => <a className="btn btn-secondary" key={item.path} href={`/setup?view=${encodeURIComponent(item.path)}`}>{item.label}</a>)}</div>{!allowed.some(item => item.moduleKey) && <p style={{ color: '#667085' }}>机构管理员尚未给此岗位分配工作模块。</p>}</div>
      <div className="card" style={{ padding: 24 }}><h2 style={{ margin: '0 0 10px', fontSize: 18 }}>待办工作</h2><p style={{ color: '#667085', margin: 0 }}>当前没有待办。客户接入后，这里按岗位显示需要处理的事项。</p></div>
    </> : <div className="card" style={{ padding: 28 }}><h2 style={{ margin: '0 0 10px', fontSize: 18 }}>{selected?.label || '本机构工作'}</h2>{view === '/profile' ? <p style={{ color: '#667085', margin: 0 }}>{staff?.name} · {roleName}{staff?.phone ? ` · ${staff.phone}` : ''}</p> : <p style={{ color: '#667085', margin: 0 }}>{emptyText}</p>}</div>}
    <p style={{ color: '#89968F', fontSize: 12, marginTop: 16 }}>当前为机构配置阶段；客户建档、派单及其他客户业务须完成跨机构数据隔离验收后开放。</p>
  </div>
}

// Admin 新建/重置员工密码后，只允许访问强制改密页；改密成功后才进入工作台。
function RequirePasswordChanged({ children }) {
  const { staff } = useStaff()
  if (staff?.mustChangePassword) return <Navigate to="/change-password" replace />
  return children
}

// 模块级权限守卫：无权限的模块即使直接敲 URL 也跳回工作台，
// 不再是"菜单藏了但路由能进"。moduleKey 从当前 pathname 前缀匹配 ROUTE_MODULE。
function RequireModule({ children }) {
  const { staff } = useStaff()
  const loc = useLocation()
  const matched = Object.keys(ROUTE_MODULE).find(
    p => loc.pathname === p || loc.pathname.startsWith(p + '/')
  )
  const moduleKey = matched ? ROUTE_MODULE[matched] : null
  if (!canViewModule(staff, moduleKey)) return <Navigate to="/home" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<RequireAuth><RequirePasswordChanged><Layout /></RequirePasswordChanged></RequireAuth>}>
              <Route index element={<StaffSetupPage />} />
            </Route>
            <Route path="/change-password" element={<RequireAuth><ForcePasswordChangePage /></RequireAuth>} />
            <Route path="/" element={<RequireAuth><RequirePasswordChanged><RequireModule><Layout /></RequireModule></RequirePasswordChanged></RequireAuth>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomePage />} />
              <Route path="service-assistant" element={<ErrorBoundary><ServiceAssistantPage /></ErrorBoundary>} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/new" element={<NewPatientPage />} />
              <Route path="patients/:id" element={<ErrorBoundary><PatientDetailPage /></ErrorBoundary>} />
              <Route path="patients/:id/annual-plan" element={<AnnualPlanPage />} />
              <Route path="followups" element={<FollowUpsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="medical-resource-knowledge" element={<MedicalResourceKnowledgePage />} />
              <Route path="plans/mgmt/:id" element={<AnnualMgmtPlanPage />} />
              <Route path="patients/:id/annual-health" element={<AnnualMgmtPlanPage patientMode />} />
              <Route path="patients/:id/monthly-reviews" element={<ErrorBoundary><MonthlyServiceReviewPage /></ErrorBoundary>} />
              <Route path="plans/:id/modules" element={<PlanModulesPage />} />
              <Route path="plans/:id" element={<PlanDetailPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="service-records" element={<ServiceRecordsPage />} />
              <Route path="knowledge" element={<KnowledgePage />} />
              <Route path="questionnaires" element={<QuestionnairePushPage />} />
              <Route path="commission" element={<CommissionPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="products" element={<ProductPushPage />} />
              <Route path="team" element={<TeamPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="notifications" element={<NotificationsPage />} />
              <Route path="marketing" element={<MarketingPage />} />
              <Route path="visitor-leads" element={<VisitorLeadsPage />} />
              <Route path="daily-checkin" element={<DailyCheckinPage />} />
              <Route path="metabolic-pilot" element={<MetabolicPilotPage />} />
              <Route path="content-reviews" element={<ContentReviewHistoryPage />} />
              <Route path="content-reviews/:id" element={<ContentReviewsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
