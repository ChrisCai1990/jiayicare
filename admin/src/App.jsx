import React, { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { getToken, clearToken } from './api'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import OrdersPage from './pages/OrdersPage'
import MessagesPage from './pages/MessagesPage'
import ServicesPage from './pages/ServicesPage'
import QuestionnairePage from './pages/QuestionnairePage'
import ChangeLogsPage from './pages/ChangeLogsPage'
import StaffPage from './pages/StaffPage'
import Layout from './components/Layout'

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
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/:id" element={<PatientDetailPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="messages" element={<MessagesPage />} />
              <Route path="services" element={<ServicesPage />} />
              <Route path="questionnaires" element={<QuestionnairePage />} />
              <Route path="change-logs" element={<ChangeLogsPage />} />
              <Route path="staff" element={<StaffPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
