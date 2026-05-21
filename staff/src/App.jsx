import React, { useState, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { getToken, clearToken } from './api'
import LoginPage from './pages/LoginPage'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import PatientsPage from './pages/PatientsPage'
import PatientDetailPage from './pages/PatientDetailPage'
import NewPatientPage from './pages/NewPatientPage'
import FollowUpsPage from './pages/FollowUpsPage'

// ── Auth Context ──────────────────────────────────────────────────
const AuthCtx = createContext(null)
export function useStaff() { return useContext(AuthCtx) }

function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jy_staff_info')) } catch { return null }
  })

  const login = (staffInfo) => {
    setStaff(staffInfo)
    localStorage.setItem('jy_staff_info', JSON.stringify(staffInfo))
  }
  const logout = () => {
    setStaff(null)
    clearToken()
  }

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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<Navigate to="/home" replace />} />
              <Route path="home" element={<HomePage />} />
              <Route path="patients" element={<PatientsPage />} />
              <Route path="patients/new" element={<NewPatientPage />} />
              <Route path="patients/:id" element={<PatientDetailPage />} />
              <Route path="followups" element={<FollowUpsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
