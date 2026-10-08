import HealthDataImportPage from './pages/HealthDataImportPage'
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
import CommissionsPage from './pages/CommissionsPage'
import MessagesPage from './pages/MessagesPage'
import FeedbackPage from './pages/FeedbackPage'
import ServicesPage from './pages/ServicesPage'
import QuestionnairePage from './pages/QuestionnairePage'
import ChangeLogsPage from './pages/ChangeLogsPage'
import ProductsPage from './pages/ProductsPage'
import PartnersPage from './pages/PartnersPage'
import EnterprisesPage from './pages/EnterprisesPage'
import TenantsPage from './pages/TenantsPage'
import PlatformAgreementPage from './pages/PlatformAgreementPage'
import SaasPlanPage from './pages/SaasPlanPage'
import ClinicalStandardsPage from './pages/ClinicalStandardsPage'
import OpsDashboardPage from './pages/OpsDashboardPage'
import CareQualityPage from './pages/CareQualityPage'
import ResearchCareJourneysPage from './pages/ResearchCareJourneysPage'
import HealthPlanTemplatePage from './pages/HealthPlanTemplatePage'
import AiCaseReviewTemplatePage from './pages/AiCaseReviewTemplatePage'
import AnnualPlanPage from './pages/AnnualPlanPage'
import Layout from './components/Layout'
import MetabolicPilotPage from './pages/MetabolicPilotPage'
import ChangePasswordPage from './pages/ChangePasswordPage'

// 基本设置
import CompanyInfoPage    from './pages/settings/CompanyInfoPage'
import DepartmentPage     from './pages/settings/DepartmentPage'
import RolePage           from './pages/settings/RolePage'
import EmployeePage       from './pages/settings/EmployeePage'
import MemberSettingsPage from './pages/settings/MemberSettingsPage'
import ScoringConfigPage  from './pages/settings/ScoringConfigPage'
import DailyCareConfigPage from './pages/settings/DailyCareConfigPage'
import ReviewExperiencePage from './pages/settings/ReviewExperiencePage'
import HealthFundConfigPage from './pages/settings/HealthFundConfigPage'
import HealthAssistantConfigPage from './pages/settings/HealthAssistantConfigPage'
import SupplyWorkflowConfigPage from './pages/settings/SupplyWorkflowConfigPage'
import ServiceWorkflowAlignmentPage from './pages/settings/ServiceWorkflowAlignmentPage'
import AiUsagePage from './pages/settings/AiUsagePage'
import MedicalResourcesPage from './pages/settings/MedicalResourcesPage'
import MedicalResourceKnowledgePage from './pages/settings/MedicalResourceKnowledgePage'
import MedicalDeliveryResourcesPage from './pages/settings/MedicalDeliveryResourcesPage'

// 项目设置
import CategoryPage       from './pages/projects/CategoryPage'
import DiseasePage        from './pages/projects/DiseasePage'
import SpecialtyLibraryPage from './pages/projects/SpecialtyLibraryPage'
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
  const location = useLocation()
  if (!admin || !token) return <Navigate to="/login" replace />
  if (admin.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  if (!admin.mustChangePassword && location.pathname === '/change-password') return <Navigate to={admin.role === 'platformSuper' ? '/tenants' : '/dashboard'} replace />
  if (admin.tenantStatus === 'setup' && !['/setup', '/settings/company', '/settings/departments', '/settings/roles', '/settings/employees', '/saas-plan', '/change-password'].includes(location.pathname)) return <Navigate to="/setup" replace />
  if (admin.role === 'platformSuper' && location.pathname !== '/tenants' && location.pathname !== '/agreements' && location.pathname !== '/saas-plan' && location.pathname !== '/clinical-standards' && location.pathname !== '/settings/ai-usage' && location.pathname !== '/change-password' && location.pathname !== '/') {
    return <Navigate to="/tenants" replace />
  }
  return children
}

function HomeRoute() {
  const { admin } = useAdmin()
  return <Navigate to={admin?.role === 'platformSuper' ? '/tenants' : admin?.tenantStatus === 'setup' ? '/setup' : '/dashboard'} replace />
}

function InstitutionSetupPage() {
  const { admin } = useAdmin()
  return <div className="page"><div className="page-header"><div><h1 className="page-title">{admin?.tenantName} · 机构配置</h1><p className="page-subtitle">当前没有本机构客户。先维护企业信息、部门、岗位和员工。</p></div></div><div className="card" style={{ padding: 28 }}><p>客户与医护业务将在跨机构数据隔离验收后开放。</p><div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>{[['企业信息', '/settings/company'], ['部门管理', '/settings/departments'], ['岗位权限', '/settings/roles'], ['员工账号', '/settings/employees'], ['本机构套餐', '/saas-plan']].map(([label, path]) => <a key={path} className="btn btn-secondary" href={path}>{label}</a>)}</div></div></div>
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
              <Route index element={<HomeRoute />} />
              <Route path="setup" element={<InstitutionSetupPage />} />
              <Route path="change-password" element={<ChangePasswordPage />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="health-data-import" element={<HealthDataImportPage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:id" element={<PatientDetailPage />} />
              <Route path="patients/:id/annual-plan" element={<AnnualPlanPage />} />
              <Route path="annual-plan/template/:templateId" element={<AnnualPlanPage templateMode />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="commissions" element={<CommissionsPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="feedback" element={<FeedbackPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="questionnaires" element={<QuestionnairePage />} />
              <Route path="change-logs" element={<ChangeLogsPage />} />
              <Route path="products"   element={<ProductsPage />} />
              <Route path="partners"   element={<PartnersPage />} />
              <Route path="enterprises" element={<EnterprisesPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="agreements" element={<PlatformAgreementPage />} />
              <Route path="saas-plan" element={<SaasPlanPage />} />
              <Route path="clinical-standards" element={<ClinicalStandardsPage />} />
              <Route path="ops-dashboard" element={<OpsDashboardPage />} />
              <Route path="care-quality" element={<CareQualityPage />} />
              <Route path="research-care-journeys" element={<ResearchCareJourneysPage />} />
              <Route path="metabolic-pilot" element={<MetabolicPilotPage />} />
              <Route path="health-plan-templates" element={<HealthPlanTemplatePage />} />
              <Route path="ai-case-review-templates" element={<AiCaseReviewTemplatePage />} />

              {/* 基本设置 */}
              <Route path="settings/company"     element={<CompanyInfoPage />} />
              <Route path="settings/departments" element={<DepartmentPage />} />
              <Route path="settings/roles"       element={<RolePage />} />
              <Route path="settings/employees"   element={<EmployeePage />} />
              <Route path="settings/medical-resources" element={<MedicalResourcesPage />} />
              <Route path="settings/medical-resource-knowledge" element={<MedicalResourceKnowledgePage />} />
              <Route path="settings/medical-delivery-resources" element={<MedicalDeliveryResourcesPage />} />
              <Route path="settings/members"  element={<MemberSettingsPage />} />
              <Route path="settings/scoring"  element={<ScoringConfigPage />} />
              <Route path="settings/daily-care" element={<DailyCareConfigPage />} />
              <Route path="settings/health-assistant" element={<HealthAssistantConfigPage />} />
              <Route path="settings/supply-workflow" element={<SupplyWorkflowConfigPage />} />
              <Route path="settings/service-workflow-alignment" element={<ServiceWorkflowAlignmentPage />} />
              <Route path="settings/ai-usage" element={<AiUsagePage />} />
              <Route path="settings/review-experience" element={<ReviewExperiencePage />} />
              <Route path="health-fund" element={<HealthFundConfigPage />} />

              {/* 项目设置 */}
              <Route path="projects/categories"       element={<CategoryPage />} />
              <Route path="projects/diseases"         element={<DiseasePage />} />
              <Route path="projects/specialty-library" element={<SpecialtyLibraryPage />} />
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
