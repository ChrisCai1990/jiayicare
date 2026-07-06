import React, { createContext, useContext, useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { getHrToken, clearHrToken } from '../../hrApi'
import HrLoginPage from './HrLoginPage'
import HrDashboardPage from './HrDashboardPage'

const HrCtx = createContext(null)
export function useHr() { return useContext(HrCtx) }

function HrProvider({ children }) {
  const [admin, setAdmin] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jy_hr_info')) } catch { return null }
  })
  const login = (info) => { setAdmin(info); localStorage.setItem('jy_hr_info', JSON.stringify(info)) }
  const logout = () => { setAdmin(null); clearHrToken() }
  return <HrCtx.Provider value={{ admin, login, logout }}>{children}</HrCtx.Provider>
}

function RequireHrAuth({ children }) {
  const { admin } = useHr()
  const token = getHrToken()
  if (!admin || !token) return <Navigate to="/hr/login" replace />
  return children
}

// 独立于超管/医护后台的企业HR门户，路由前缀 /hr，token与页面完全隔离
export default function HrApp() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = '企业健康管理平台'
    return () => { document.title = prevTitle }
  }, [])

  return (
    <HrProvider>
      <Routes>
        <Route path="login" element={<HrLoginPage />} />
        <Route path="dashboard" element={<RequireHrAuth><HrDashboardPage /></RequireHrAuth>} />
        <Route path="*" element={<Navigate to="/hr/dashboard" replace />} />
      </Routes>
    </HrProvider>
  )
}
