import React from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdmin } from '../../App'
import '../partnerWorkspace.css'

const sections = [
  ['/partner-workbench/overview', '团队与人员'],
  ['/partner-workbench/business-accounting', '经营与分账'],
  ['/partner-workbench/operations', '业务登记'],
  ['/partner-workbench/finance', '财务审核'],
  ['/partner-workbench/team-earnings', '负责人逐笔核对'],
]

export default function PartnerWorkbench() {
  const { admin } = useAdmin()
  const location = useLocation()
  if (admin?.role !== 'superadmin') return <Navigate to="/dashboard" replace />
  return <div className="partner-workspace"><div className="partner-workspace__shell">
    <header className="partner-workspace__hero">
      <div className="partner-workspace__eyebrow">JIAYICARE · BUSINESS WORKSPACE</div>
      <h1>嘉医汇业务工作台</h1>
      <p>查看团队、业务与结算，处理登记和财务核对</p>
    </header>
    <nav className="partner-workspace__nav" aria-label="业务工作台导航">
      {sections.map(([path, label]) => <Link key={path} aria-current={location.pathname === path ? 'page' : undefined}
        to={path}>{label}</Link>)}
      <Link className="partner-workspace__back" to="/partner-teams">返回规则设置 ↗</Link>
    </nav>
    <Outlet />
  </div>
  </div>
}
