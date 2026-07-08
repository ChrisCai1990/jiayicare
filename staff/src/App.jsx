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
import { getToken, clearToken, staffAPI } from './api'
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
import AnnualPlanPage from './pages/AnnualPlanPage'
import AnnualMgmtPlanPage from './pages/AnnualMgmtPlanPage'
import AbnormalReviewPage from './pages/AbnormalReviewPage'
import DailyCheckinPage from './pages/DailyCheckinPage'

// ── Auth Context ──────────────────────────────────────────────────
const AuthCtx = createContext(null)
export function useStaff() { return useContext(AuthCtx) }

// 路由 path → 权限模块 key。与 Layout.jsx 的 ALL_NAV.moduleKey 保持一致。
// 未列出的路由（工作台/消息/个人中心/患者详情等）不做模块级权限拦截。
export const ROUTE_MODULE = {
  '/patients': 'patients',
  '/followups': 'followups',
  '/plans': 'plans',
  '/reports': 'reports',
  '/abnormal-reviews': 'abnormal_review',
  '/service-records': 'service_records',
  '/knowledge': 'knowledge',
  '/questionnaires': 'questionnaires',
  '/products': 'products',
  '/commission': 'commission',
  '/marketing': 'marketing',
  '/team': 'team',
  '/operations': 'operations',
  '/daily-checkin': 'daily_checkin',
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
  const login = (staffInfo) => {
    setStaff(staffInfo)
    localStorage.setItem('jy_staff_info', JSON.stringify(staffInfo))
  }
  const logout = () => { setStaff(null); clearToken() }

  // 员工登录后 staff 信息(含 customPermissions)只在登录那一刻写入 localStorage，此后不再刷新——
  // 2026-07-07 排查确认：超管在角色管理里事后给该员工分配/修改自定义角色权限，员工浏览器缓存的
  // 旧 staff 对象里 customPermissions 仍是登录时的旧值(通常是null)，导致侧边栏按固定角色显示全部菜单，
  // 必须手动退出重新登录才生效。这里应用挂载时主动拉一次最新 /staff/me 覆盖缓存，不依赖重新登录。
  React.useEffect(() => {
    if (!getToken()) return
    staffAPI.me().then(r => {
      if (r.data) { setStaff(r.data); localStorage.setItem('jy_staff_info', JSON.stringify(r.data)) }
    }).catch(() => {})
  }, [])

  return <AuthCtx.Provider value={{ staff, login, logout }}>{children}</AuthCtx.Provider>
}

// ── Toast Context ─────────────────────────────────────────────────
const ToastCtx = createContext(null)
export function useToast() { return useContext(ToastCtx) }

function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = (msg, duration = 2500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </ToastCtx.Provider>
  )
}

// ── Guard ─────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { staff } = useStaff()
  const token = getToken()
  if (!staff || !token) return <Navigate to="/login" replace />
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
            <Route path="/" element={<RequireAuth><RequireModule><Layout /></RequireModule></RequireAuth>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomePage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/new" element={<NewPatientPage />} />
              <Route path="patients/:id" element={<ErrorBoundary><PatientDetailPage /></ErrorBoundary>} />
              <Route path="patients/:id/annual-plan" element={<AnnualPlanPage />} />
              <Route path="followups" element={<FollowUpsPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/mgmt/:id" element={<AnnualMgmtPlanPage />} />
              <Route path="patients/:id/annual-health" element={<AnnualMgmtPlanPage patientMode />} />
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
              <Route path="abnormal-reviews" element={<AbnormalReviewPage />} />
              <Route path="daily-checkin" element={<DailyCheckinPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
