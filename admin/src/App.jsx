import React, { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getToken, clearToken } from './api'
import LoginPage from './pages/LoginPage'
import HrApp from './pages/hr/HrApp'
import PublicOpsDashboardPage from './pages/public/PublicOpsDashboardPage'
import DashboardPage from './pages/DashboardPage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import OrdersPage from './pages/OrdersPage'
import MessagesPage from './pages/MessagesPage'
import ServicesPage from './pages/ServicesPage'
import QuestionnairePage from './pages/QuestionnairePage'
import ChangeLogsPage from './pages/ChangeLogsPage'
import ProductsPage from './pages/ProductsPage'
import PartnersPage from './pages/PartnersPage'
import EnterprisesPage from './pages/EnterprisesPage'
import OpsDashboardPage from './pages/OpsDashboardPage'
import HealthPlanTemplatePage from './pages/HealthPlanTemplatePage'
import AnnualPlanPage from './pages/AnnualPlanPage'
import Layout from './components/Layout'

// 基本设置
import CompanyInfoPage    from './pages/settings/CompanyInfoPage'
import DepartmentPage     from './pages/settings/DepartmentPage'
import RolePage           from './pages/settings/RolePage'
import EmployeePage       from './pages/settings/EmployeePage'
import MemberSettingsPage from './pages/settings/MemberSettingsPage'
import ScoringConfigPage  from './pages/settings/ScoringConfigPage'

// 项目设置
import CategoryPage       from './pages/projects/CategoryPage'
import DiseasePage        from './pages/projects/DiseasePage'
import LabTestItemPage    from './pages/projects/LabTestItemPage'
import LabTestOrderPage   from './pages/projects/LabTestOrderPage'
import LabTestPackagePage from './pages/projects/LabTestPackagePage'
import SpecialExamPage    from './pages/projects/SpecialExamPage'
import FunctionalMedicinePage from './pages/projects/FunctionalMedicinePage'
import ServiceItemPage    from './pages/projects/ServiceItemPage'
import OtherChargePage    from './pages/projects/OtherChargePage'
import ProjectTemplatePage from './pages/projects/ProjectTemplatePage'
import FollowUpFormPage   from './pages/projects/FollowUpFormPage'
import FollowUpPlanPage   from './pages/projects/FollowUpPlanPage'

// ── Auth Context ─────────────────────────────────────────────────
const AuthCtx = createContext(null)
export function useAdmin() { return useContext(AuthCtx) }

function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jy_admin_info')) } catch { return null }
  })

  const login = (adminInfo) => {
    setAdmin(adminInfo)
    localStorage.setItem('jy_admin_info', JSON.stringify(adminInfo))
  }
  const logout = () => {
    setAdmin(null)
    clearToken()
  }

  return <AuthCtx.Provider value={{ admin, login, logout }}>{children}</AuthCtx.Provider>
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
  const { admin } = useAdmin()
  const token = getToken()
  if (!admin || !token) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/hr/*" element={<HrApp />} />
            <Route path="/public/ops/:slug" element={<PublicOpsDashboardPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:id" element={<PatientDetailPage />} />
              <Route path="patients/:id/annual-plan" element={<AnnualPlanPage />} />
              <Route path="annual-plan/template/:templateId" element={<AnnualPlanPage templateMode />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="questionnaires" element={<QuestionnairePage />} />
              <Route path="change-logs" element={<ChangeLogsPage />} />
              <Route path="products"   element={<ProductsPage />} />
              <Route path="partners"   element={<PartnersPage />} />
              <Route path="enterprises" element={<EnterprisesPage />} />
              <Route path="ops-dashboard" element={<OpsDashboardPage />} />
              <Route path="health-plan-templates" element={<HealthPlanTemplatePage />} />

              {/* 基本设置 */}
              <Route path="settings/company"     element={<CompanyInfoPage />} />
              <Route path="settings/departments" element={<DepartmentPage />} />
              <Route path="settings/roles"       element={<RolePage />} />
              <Route path="settings/employees"   element={<EmployeePage />} />
              <Route path="settings/members"  element={<MemberSettingsPage />} />
              <Route path="settings/scoring"  element={<ScoringConfigPage />} />

              {/* 项目设置 */}
              <Route path="projects/categories"       element={<CategoryPage />} />
              <Route path="projects/diseases"         element={<DiseasePage />} />
              <Route path="projects/lab-test-items"   element={<LabTestItemPage />} />
              <Route path="projects/lab-test-orders"  element={<LabTestOrderPage />} />
              <Route path="projects/lab-test-packages" element={<LabTestPackagePage />} />
              <Route path="projects/special-exams"    element={<SpecialExamPage />} />
              <Route path="projects/functional-medicine" element={<FunctionalMedicinePage />} />
              <Route path="projects/service-items"    element={<ServiceItemPage />} />
              <Route path="projects/other-charges"    element={<OtherChargePage />} />
              <Route path="projects/templates"        element={<ProjectTemplatePage />} />
              <Route path="projects/followup-forms"   element={<FollowUpFormPage />} />
              <Route path="projects/followup-plans"   element={<FollowUpPlanPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
